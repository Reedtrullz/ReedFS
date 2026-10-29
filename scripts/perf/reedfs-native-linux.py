#!/usr/bin/env python3
"""ReedFS O19/U16 native browser qualifier (hosted Linux only).

Runs scripts/perf/reedfs-native-controls.mjs against the real dev-served app and installed Chromium inside the
frozen util-linux namespace guard. Exit 0 = every control PASS, 1 = FAIL, 2 = BLOCKED/incomplete.
"""
import argparse, base64, builtins, errno, hashlib, json, os, pathlib, re, shutil, signal, subprocess, sys, tempfile, threading, time
from typing import Any

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
GUARD_SHA256 = '6428ed96d1a44b42ba85002cec711ae8377ddc88fbdf53db98b8a46e85591801'
RFMS_COMMIT = '810fc9652da431eaf8978b85bf4af131605559b5'
NATIVE_OUTPUT_CAP = 1 << 20
GUARD_OUTPUT_CAP = 64 << 10
SCRATCH_SIZE = '48m'  # namespace tmpfs; parent outputs/caches get PARENT_CAP; together <= 64MiB
PARENT_CAP = 16 << 20
SCREENSHOT_CAP = 300000
COHORTS = ('desktop-worker', 'desktop-main', 'narrow-worker', 'narrow-main')
PROTOCOL = ('native-worker/main-six-command-physical-control-route-observation-parity', 'native-payload-out-of-order-duplicate-late-delivery', 'cohort', 'nonfinite', 'timeout-snapshot', 'dispose', 'actual-native-worker-crash', 'actual-worker-nonfinite-execution', 'held-trim-during-real-worker', 'source-hidden-gap-catchup-component')
NATIVE_TOTAL = 120  # whole native invocation incl. shutdown and cleanup observation
SHUTDOWN = 20  # reserved inside every deadline: group kill, reader join, pgrep/mount observation
NATIVE_LIMIT = NATIVE_TOTAL - SHUTDOWN - 10  # inner app limit; the parent kills at NATIVE_TOTAL - SHUTDOWN
# Denial vocabularies come from what the frozen guard constants can emit: type(e).__name__ of an OSError, errno names, e.errno.
SOCKET_DENIALS = {c.__name__ for c in vars(builtins).values() if isinstance(c, type) and issubclass(c, OSError)}
READ_DENIALS = {'ENOENT', 'EACCES', 'EPERM', 'ENOTDIR'}
WRITE_DENIALS = {errno.EPERM, errno.ENOENT, errno.EACCES, errno.EROFS}
# Preamble before the frozen SCRIPT: private propagation first, then mask a visible RFMS .git (the frozen SCRIPT masks only the checkout .git).
RFMS_MASK = 'set -eu\nr=$1; shift\nmount --make-rprivate /\nif [ -d "$r" ]; then mount -t tmpfs -o size=4k,mode=0555,ro tmpfs "$r"; elif [ -e "$r" ]; then mount --bind /dev/null "$r"; fi\nexec "$@"\n'
# "absent" only for an exact ENOENT; any other stat error is kind "unknown".
RFMS_PROBE = '''import errno, json, os, stat, sys
p = sys.argv[1]
def name(e): return errno.errorcode.get(e.errno, str(e.errno))
def rd(q):
    try: return "READ" if open(q, "rb").read(1) else "EMPTY"
    except OSError as e: return name(e)
try: m = os.stat(p).st_mode
except OSError as e:
    print(json.dumps({"kind": "absent" if e.errno == errno.ENOENT else "unknown", "head": None, "self": None, "err": name(e)})); sys.exit(0)
kind = "dir" if stat.S_ISDIR(m) else "chr" if stat.S_ISCHR(m) else "file" if stat.S_ISREG(m) else "other"
print(json.dumps({"kind": kind, "head": rd(p + "/HEAD") if kind == "dir" else None, "self": rd(p) if kind in ("chr", "file") else None, "err": None}))
'''


def expected_controls():
    """Must equal requiredControls() in reedfs-native-controls.mjs (cross-checked by the Node test)."""
    base = ['scene-fidelity', 'layout', 'camera', 'start-roll', 'keyboard', 'pause', 'reset', 'no-unexpected-pageerrors']
    return [k for c in COHORTS for k in cohort_keys(c, base)]


def cohort_keys(c, base=None):
    base = base or ['scene-fidelity', 'layout', 'camera', 'start-roll', 'keyboard', 'pause', 'reset', 'no-unexpected-pageerrors']
    vp, mode = c.split('-')
    keys = [c + ':' + k for k in base]
    if vp == 'desktop': keys.append(c + ':tab-hidden-resume')
    if mode == 'worker': keys.append(c + ':stale-fence-spec')
    if c == 'desktop-worker': keys += [c + ':worker-error', c + ':worker-messageerror'] + [c + ':protocol:' + x for x in PROTOCOL]
    return keys


def validate_matrix(matrix, keys):
    """An untrusted child's matrix must have exactly the expected unique rows, known statuses, evidence/reason, and a consistent status."""
    if not isinstance(matrix, dict) or not isinstance(matrix.get('rows'), list):
        return ['matrix missing or rows not a list']
    bad, seen = [], set()
    for r in matrix['rows']:
        k = r.get('key') if isinstance(r, dict) else None
        if k not in keys:
            bad.append('unknown row %r' % (k,)); continue
        if k in seen: bad.append('duplicate row ' + k)
        seen.add(k)
        st = r.get('status')
        if st not in ('PASS', 'FAIL', 'BLOCKED', 'MISSING'): bad.append('bad status ' + k)
        elif st == 'PASS' and not isinstance(r.get('evidence'), dict): bad.append('PASS without evidence ' + k)
        elif st != 'PASS' and not r.get('reason'): bad.append('non-PASS without reason ' + k)
    bad += ['missing row ' + k for k in keys if k not in seen]
    if not bad:
        sts = [r['status'] for r in matrix['rows']]
        want = 'FAIL' if 'FAIL' in sts else 'BLOCKED' if ('BLOCKED' in sts or 'MISSING' in sts) else 'PASS'
        if matrix.get('status') != want: bad.append('matrix status %r does not follow rows (%s)' % (matrix.get('status'), want))
    return bad


def load_guard():
    raw = (HERE / 'linux-namespace-guard.json').read_bytes()
    got = hashlib.sha256(raw).hexdigest()
    if got != GUARD_SHA256:
        raise SystemExit('frozen guard constants changed: ' + got)
    return json.loads(raw)


class Budget:
    def __init__(self, total):
        self.left = total
        self.total = total

    @property
    def used(self):
        return self.total - self.left


def sudo_kill(proc):
    try:
        subprocess.run(['sudo', '-n', 'kill', '-KILL', '--', '-%d' % proc.pid], capture_output=True, timeout=4)
    except subprocess.SubprocessError:
        pass  # the caller observes the survivor


def run_bounded(argv, *, limit, budget, total=None, cwd=None, kill=sudo_kill) -> dict[str, Any]:
    """Run argv; stdout and stderr share one budget (1/16 of it is held back from stdout for primary stderr); kill on cap or at min(limit, total-SHUTDOWN).
    The whole call (kill, reader join) is bounded by total. Pipes are closed only once every reader has ended;
    otherwise unterminated=True and the caller must not clean up."""
    start = time.monotonic()
    total = total or limit + SHUTDOWN
    limit = min(limit, total - SHUTDOWN)
    hard = start + total
    left = lambda: max(0.0, hard - time.monotonic())
    proc = subprocess.Popen(argv, cwd=cwd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    out = {'stdout': bytearray(), 'stderr': bytearray()}
    stop, lock, state = threading.Event(), threading.Lock(), {'capped': False, 'timeout': False}

    def pump(name, stream):
        while True:
            chunk = stream.read1(65536)
            if not chunk:
                return
            with lock:
                avail = budget.left
                if name == 'stdout':
                    avail = max(0, avail - max(0, (budget.total >> 4) - len(out['stderr'])))
                if len(chunk) > avail:
                    out[name] += chunk[:avail]
                    budget.left -= avail
                    state['capped'] = True
                    stop.set()
                    return
                budget.left -= len(chunk)
                out[name] += chunk

    threads = [threading.Thread(target=pump, args=(n, s), daemon=True) for n, s in (('stdout', proc.stdout), ('stderr', proc.stderr))]
    for t in threads:
        t.start()
    while proc.poll() is None:
        if stop.is_set():
            kill(proc)
            break
        if time.monotonic() - start > limit:
            state['timeout'] = True
            kill(proc)
            break
        time.sleep(0.05)

    def reap(seconds):
        end = time.monotonic() + min(seconds, left())
        try:
            proc.wait(timeout=max(0.0, end - time.monotonic()))
        except subprocess.TimeoutExpired:
            pass
        for t in threads:
            t.join(max(0.0, end - time.monotonic()))

    reap(3)
    if proc.poll() is None or any(t.is_alive() for t in threads):  # leader alive, or a descendant still holds a pipe
        if left() > 0:
            kill(proc)
        reap(5)
    unterminated = proc.poll() is None or any(t.is_alive() for t in threads)
    if not unterminated:
        proc.stdout.close()
        proc.stderr.close()
    return {'code': proc.returncode, 'stdout': bytes(out['stdout']).decode('utf-8', 'replace'), 'stderr': bytes(out['stderr']).decode('utf-8', 'replace'),
            'capped': state['capped'], 'timeout': state['timeout'], 'unterminated': unterminated, 'seconds': round(time.monotonic() - start, 2)}


def ns_argv(guard, *, scratch, root, shared, home, limit, size, cmd, env, rfms_git):
    uid, gid = os.getuid(), os.getgid()
    if uid == 0:
        raise SystemExit('refusing to qualify as root; privileges are dropped to the invoking user')
    inner = ['bash', '-c', 'cd "$1" && shift && exec "$@"', 'bash', str(root), 'env', '-i'] + ['%s=%s' % kv for kv in env.items()] + list(cmd)
    # The frozen SCRIPT replaces HOME with an empty tmpfs and rebinds only root and shared; a mount made earlier below HOME stays in mountinfo and breaks its remount loop.
    p, under = pathlib.Path(rfms_git).resolve(), lambda q: p.is_relative_to(pathlib.Path(q).resolve())
    mask = '' if under(home) and not (under(root) or under(shared)) else str(rfms_git)
    return (['sudo', '-n', 'unshare', '--net', '--mount', '--pid', '--fork', '--kill-child', '--mount-proc',
             'bash', '-c', RFMS_MASK, 'bash', mask, 'bash', '-c', guard['SCRIPT'], 'bash',
             scratch, str(uid), str(gid), str(root), str(home), str(shared), str(limit), size] + inner)


def inner_env(scratch, node):
    return {'PATH': '%s:/usr/local/bin:/usr/bin:/bin' % pathlib.Path(node).parent, 'HOME': scratch + '/home', 'TMPDIR': scratch + '/tmp',
            'XDG_CACHE_HOME': scratch + '/cache', 'XDG_CONFIG_HOME': scratch + '/config', 'LANG': 'C.UTF-8', 'RFS_SCRATCH': scratch}


def leftovers(scratch, unterminated=False):
    """Exact cleanup proof: readers/descendants ended, pgrep exit 1 (no process), mounts readable and absent. The scratch
    directory is removed only when every observation is clean; any survivor or observation error keeps it."""
    problems = ['stream readers or process group still open'] if unterminated else []
    try:
        rc = subprocess.run(['pgrep', '-f', '--', scratch], capture_output=True, timeout=5).returncode
    except (OSError, subprocess.SubprocessError):
        problems.append('process observation unavailable')
    else:
        if rc == 0: problems.append('process mentioning scratch survived')
        elif rc != 1: problems.append('process observation failed: pgrep exit %s' % rc)
    try:
        mounted = scratch in pathlib.Path('/proc/mounts').read_text()
    except OSError:
        problems.append('mount observation unavailable')
    else:
        if mounted: problems.append('scratch mount survived')
    if not problems:
        shutil.rmtree(scratch, ignore_errors=True)
        if os.path.exists(scratch):
            problems.append('scratch directory not removable')
    return problems


HIDDEN_ROOTS = ('/tmp', '/var/tmp', '/dev/shm')  # the frozen SCRIPT rebinds these, so scratch placed below them hides itself


def scratch_parent():
    """Hosted runs place scratch under RUNNER_TOOL_CACHE; unset (local/macOS) keeps the tempfile default. An unusable root raises, never falls back."""
    cache = os.environ.get('RUNNER_TOOL_CACHE')
    if cache is None:
        return None
    p = pathlib.Path(cache)
    masked = [pathlib.Path(x).resolve() for x in (*HIDDEN_ROOTS, os.path.expanduser('~'), ROOT, ROOT.parent / 'RFMS')]
    if not (p.is_absolute() and p.is_dir() and os.access(p, os.W_OK | os.X_OK)) or any(p.resolve().is_relative_to(x) for x in masked):
        raise RuntimeError('RUNNER_TOOL_CACHE is not an existing writable directory outside masked/restored roots: %s' % cache)
    return str(p)


def ns_run(guard, cmd, *, budget, limit, size, shared, rfms_git, extra_env=None, node=None, total=None):
    node = node or shutil.which('node')
    total = total or limit + SHUTDOWN + 10
    t0 = time.monotonic()
    scratch = tempfile.mkdtemp(prefix='reedfs-native-', dir=scratch_parent())
    # Keep this user-owned directory: the frozen SCRIPT's mkdir -p reuses it as the tmpfs mountpoint, so the parent can remove it afterwards.
    env = {**inner_env(scratch, node), **(extra_env or {})}
    res = None
    try:
        res = run_bounded(ns_argv(guard, scratch=scratch, root=ROOT, shared=shared, home=os.path.expanduser('~'), limit=limit, size=size, cmd=cmd, env=env, rfms_git=rfms_git),
                          limit=limit + 10, total=total, budget=budget, cwd=str(ROOT))
    finally:
        left = leftovers(scratch, unterminated=res is None or res['unterminated'])
    res['leftovers'] = left
    res['scratch'] = scratch
    res['scratch_parent'] = os.path.dirname(scratch)
    res['total_seconds'] = round(time.monotonic() - t0, 2)
    return res


def timeout_identity(env=os.environ):
    """Read-only identity of the timeout binary and runner image; records observations only, no implementation is required."""
    path = shutil.which('timeout')
    ident = {'path': path, 'runner_image': {k: env[k] for k in ('ImageOS', 'ImageVersion') if k in env}}
    if path:
        real = pathlib.Path(path).resolve()
        ident.update(real_path=str(real), sha256=hashlib.sha256(real.read_bytes()).hexdigest())
        try:
            v = subprocess.run([path, '--version'], capture_output=True, text=True, timeout=3)
            ident['version'] = {'code': v.returncode, 'output': (v.stdout + v.stderr)[:300]}
        except (OSError, subprocess.TimeoutExpired) as e:
            ident['version'] = {'error': type(e).__name__}
    return ident


def judge_guard(name, res, rfms_kind=None, rfms_hidden=False):
    """Return a failure string, or None when the denial/bound control behaved as the guard requires. Observations must be complete and exact."""
    if res['leftovers']:
        return 'cleanup: ' + '; '.join(res['leftovers'])
    if name == 'FLOOD':
        return None if res['capped'] and not res['timeout'] else 'flood not cut by output cap'
    if name == 'SLEEP':
        # The frozen SLEEP runs 60s under a 2s limit: the observed native result was 124 after 2.11s; setup errors and immediate exits are not that timeout.
        return None if res['code'] in (124, 137, -signal.SIGKILL) and not res['capped'] and not res['timeout'] and 1.9 <= res['seconds'] < 12 else 'hung command not killed by wall limit'
    if res['code'] != 0 or res['timeout'] or res['capped']:
        return 'control failed to run: ' + (res['stderr'] or res['stdout'])[:800]
    if name == 'SURVIVOR':
        return None
    try:
        j = json.loads(res['stdout'].strip().splitlines()[-1])
    except (ValueError, IndexError):
        return 'unparseable control output: ' + res['stdout'][:300]
    if not isinstance(j, dict):
        return 'control output is not an object'
    wr = lambda v: type(v) is int and v in WRITE_DENIALS  # type() excludes bool
    rd = lambda v: type(v) is str and v in READ_DENIALS
    nm = lambda v: type(v) is str and v in SOCKET_DENIALS
    if name == 'EGRESS':
        ok = set(j) == {'loopback', '192.0.2.1', '1.1.1.1'} and j['loopback'] == 'OK' and nm(j['192.0.2.1']) and nm(j['1.1.1.1'])
    elif name == 'PRIVATE':
        o = j.get('outside')
        ok = set(j) == {'home_canary', 'git_head', 'outside'} and isinstance(o, dict) and set(o) == {'checkout', 'home', 'host_dir'} and rd(j['home_canary']) \
            and rd(j['git_head']) and o['host_dir'] == 'ABSENT' and wr(o['checkout']) and wr(o['home'])
    elif name == 'PRIVS':
        c = j.get('caps')
        ok = set(j) == {'nnp', 'caps', 'sudo', 'setuid0', 'mount'} and isinstance(c, dict) and set(c) == {'CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'} and all(isinstance(v, str) and re.fullmatch('0+', v) for v in c.values()) \
            and type(j['nnp']) is int and j['nnp'] == 1 and j['sudo'] == 'DENIED' and j['setuid0'] == 'EPERM' and j['mount'] == 'DENIED'
    elif name == 'WRITES':
        ok = set(j) == {'checkout', 'home', 'scratch'} and wr(j['checkout']) and wr(j['home']) and j['scratch'] == 'WRITABLE'
    elif name == 'OVERLIMIT':
        ok = set(j) == {'errno', 'mib'} and type(j['errno']) is int and j['errno'] == errno.ENOSPC and type(j['mib']) is int and 1 <= j['mib'] <= 4
    elif name == 'RFMS':
        want = {'dir': ('dir', 'ENOENT', None, None), 'file': ('chr', None, 'EMPTY', None), 'absent': ('absent', None, None, 'ENOENT')}.get(rfms_kind)
        got = tuple(j.get(k) for k in ('kind', 'head', 'self', 'err'))
        # A parent hidden under the masked HOME may vanish; that counts only as an exact observed ENOENT.
        ok = set(j) == {'kind', 'head', 'self', 'err'} and want is not None and (got == want or (rfms_hidden and got == ('absent', None, None, 'ENOENT')))
    else:
        ok = False
    return None if ok else 'guard denial missing or incomplete: ' + json.dumps(j)[:500]


def git(*args, cwd=ROOT):
    p = subprocess.run(['git', *args], cwd=cwd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError('git %s failed (%d): %s' % (' '.join(args), p.returncode, p.stderr[:200]))
    return p.stdout.strip()


def source_state(root=ROOT):
    return {'head': git('rev-parse', 'HEAD', cwd=root), 'dirty': git('status', '--porcelain', cwd=root)}


def source_problems(before, after, expected_sha, rfms_head):
    p = []
    if before['dirty']:
        p.append('dirty source before run')
    if expected_sha is not None and before['head'] != expected_sha:
        p.append('stale source: HEAD %s != %s' % (before['head'], expected_sha))
    if before != after:
        p.append('source changed during run')
    if rfms_head != RFMS_COMMIT:
        p.append('RFMS is not the pinned revision: %s' % rfms_head)
    return p


def parse_native(stdout):
    """Split NDJSON; malformed lines are kept as problems rather than silently dropped."""
    recs, bad = [], []
    for line in stdout.splitlines():
        try:
            recs.append(json.loads(line))
        except ValueError:
            bad.append(line[:200])
    return recs, bad


def final_status(matrix, problems, keys=None):
    if matrix is None:
        return 'FAIL' if problems else 'BLOCKED'
    if problems or validate_matrix(matrix, keys or expected_controls()):
        return 'FAIL'
    return matrix['status']


def check_screenshots(recs, cohort, out):
    """Exact per-cohort allowlist; strict base64/hash/size; required shots must all be present. Returns problems."""
    want, seen, bad = {'layout-' + cohort, 'final-' + cohort}, set(), []
    for r in recs:
        if r.get('kind') != 'screenshot':
            continue
        n = r.get('name')
        if not isinstance(n, str) or n not in want or n in seen:
            bad.append('screenshot name rejected: %r' % (str(n)[:60],)); continue
        seen.add(n)
        try:
            raw = base64.b64decode(r.get('base64') or '', validate=True)
        except (ValueError, TypeError):
            bad.append('invalid base64 ' + n); continue
        if not raw or len(raw) > SCREENSHOT_CAP or r.get('bytes') != len(raw):
            bad.append('screenshot size invalid ' + n); continue
        if hashlib.sha256(raw).hexdigest() != r.get('sha256'):
            bad.append('screenshot hash mismatch ' + n); continue
        (out / (n + '.jpg')).write_bytes(raw)
    return bad + ['required screenshot missing: ' + n for n in sorted(want - seen) if True]


def tree_bytes(path):
    return sum(f.stat().st_size for f in pathlib.Path(path).rglob('*') if f.is_file())


def envelope_problems(artifacts, canary, cache, ns_peak):
    """Parent artifacts + canary + cache <= 16MiB; with the namespace peak (<=48MiB) the whole run <= 64MiB."""
    p = []
    if artifacts + canary + cache > PARENT_CAP: p.append('owned parent bytes above 16MiB')
    if ns_peak > 48 << 20: p.append('namespace scratch peak above 48MiB')
    if ns_peak + artifacts + canary + cache > 64 << 20: p.append('combined scratch above 64MiB')
    return p


def qualify(out):
    guard = load_guard()
    if out.exists() and any(out.iterdir()):  # never hide or mix with a prior run's files
        print(json.dumps({'status': 'FAIL', 'problems': ['stale output directory is not empty: %s' % out]}))
        return 1
    out.mkdir(parents=True, exist_ok=True)
    node, chrome = shutil.which('node'), os.environ.get('RFS_NATIVE_BROWSER') or next((shutil.which(b) for b in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser') if shutil.which(b)), None)
    rfms = (ROOT.parent / 'RFMS').resolve()
    shared = rfms / 'shared'
    result: dict[str, Any] = {'status': None, 'problems': [], 'source': {}, 'guards': {}, 'native': {}}
    if not (node and chrome and shared.is_dir()):
        result.update(status='BLOCKED', problems=['missing node/browser/RFMS shared: %s' % json.dumps({'node': node, 'chrome': chrome, 'shared': str(shared)})])
        (out / 'result.json').write_text(json.dumps(result, indent=2))
        return 2
    try:
        before = source_state()
        rfms_head = git('rev-parse', 'HEAD', cwd=rfms)
    except RuntimeError as e:
        result.update(status='FAIL', problems=['git helper failed: %s' % e])
        (out / 'result.json').write_text(json.dumps(result, indent=2))
        return 1
    rfms_git = rfms / '.git'
    rfms_kind = 'dir' if rfms_git.is_dir() else 'file' if rfms_git.is_file() else 'absent'
    home = pathlib.Path(os.path.expanduser('~')).resolve()
    rfms_hidden = rfms_git.is_relative_to(home)  # the frozen SCRIPT replaces HOME with an empty tmpfs
    result['source'] = {'head': before['head'], 'rfms': rfms_head, 'rfms_git_kind': rfms_kind, 'node': node, 'chrome': subprocess.run([chrome, '--version'], capture_output=True, text=True).stdout.strip(), 'timeout': timeout_identity(),
                        'version_json': (ROOT / 'dist/rfs-version.json').read_text() if (ROOT / 'dist/rfs-version.json').exists() else None}
    py = sys.executable
    try:
        result['source']['runner_tool_cache'] = os.environ.get('RUNNER_TOOL_CACHE')
        result['source']['scratch_parent'] = scratch_parent()
    except RuntimeError as e:
        result.update(status='BLOCKED', problems=[str(e)])
        (out / 'result.json').write_text(json.dumps(result, indent=2))
        return 2
    canary_dir = pathlib.Path(tempfile.mkdtemp(prefix='.reedfs-guard-', dir=os.path.expanduser('~')))
    (canary_dir / 'canary').write_text('x')
    canary_bytes = tree_bytes(canary_dir)
    marker = 'reedfs-marker-%d' % os.getpid()
    controls = {
        'EGRESS': ([py, '-c', guard['EGRESS']], 20, '8m'),
        'PRIVATE': ([py, '-c', guard['PRIVATE'], str(canary_dir / 'canary'), str(ROOT), str(canary_dir), marker, os.path.expanduser('~')], 20, '8m'),
        'PRIVS': ([py, '-c', guard['PRIVS']], 30, '8m'),
        'WRITES': ([py, '-c', guard['WRITES'], str(ROOT), os.path.expanduser('~')], 20, '8m'),
        'OVERLIMIT': ([py, '-c', guard['OVERLIMIT']], 60, '4m'),
        'RFMS': ([py, '-c', RFMS_PROBE, str(rfms_git)], 20, '8m'),
        'FLOOD': ([py, '-c', guard['FLOOD']], 20, '8m'),
        'SLEEP': ([py, '-c', guard['SLEEP']], 2, '8m'),
        'SURVIVOR': ([py, '-c', guard['SURVIVOR'], 'reedfs-survivor-%d' % os.getpid()], 20, '8m'),
    }
    try:
        for name, (cmd, limit, size) in controls.items():
            res = ns_run(guard, cmd, budget=Budget(GUARD_OUTPUT_CAP), limit=limit, size=size, shared=shared, rfms_git=rfms_git)
            why = judge_guard(name, res, rfms_kind, rfms_hidden)
            result['guards'][name] = {'status': 'PASS' if why is None else 'FAIL', 'why': why, 'code': res['code'], 'seconds': res['seconds'], 'stdout': res['stdout'][:600], 'stderr': res['stderr'][:600]}
            result['guards'][name]['scratch'] = res['scratch']
        leaked = [b for b in ('/tmp', '/var/tmp', '/dev/shm') if os.path.exists(os.path.join(b, marker))]
        if leaked:
            result['guards']['PRIVATE']['status'] = 'FAIL'
            result['guards']['PRIVATE']['why'] = 'marker leaked to host ' + ','.join(leaked)
    finally:
        shutil.rmtree(canary_dir, ignore_errors=True)
    guard_fail = [k for k, v in result['guards'].items() if v['status'] != 'PASS']
    all_rows, cohorts, matrix, ns_peak = [], {}, None, 0
    if guard_fail:
        result['problems'].append('guard controls failed, app not run: ' + ','.join(guard_fail))
    else:
        have_xvfb = shutil.which('Xvfb')
        script = str(HERE / 'reedfs-native-controls.mjs')
        for c in COHORTS:  # four separate invocations, each with its own 120s bound and 1MiB streams
            headed = c.startswith('desktop') and have_xvfb
            cmd = ['bash', '-c', 'Xvfb :99 -nolisten tcp -screen 0 1440x900x24 >/dev/null 2>&1 & xp=$!; trap "kill $xp 2>/dev/null" EXIT; sleep 1; "$@"', 'bash', node, script, c] if headed else [node, script, c]
            extra = {'RFS_NATIVE_BROWSER': chrome, **({'DISPLAY': ':99', 'RFS_HEADED': '1'} if headed else {})}
            budget = Budget(NATIVE_OUTPUT_CAP)
            res = ns_run(guard, cmd, budget=budget, limit=NATIVE_LIMIT, total=NATIVE_TOTAL, size=SCRATCH_SIZE, shared=shared, rfms_git=rfms_git, extra_env=extra)
            (out / ('native-%s.ndjson' % c)).write_text(res['stdout'])
            (out / ('native-%s.stderr.txt' % c)).write_text(res['stderr'])
            recs, bad = parse_native(res['stdout'])
            probs = check_screenshots(recs, c, out)
            m = [r for r in recs if r.get('kind') == 'matrix']
            summary = next((r for r in recs if r.get('kind') == 'summary'), None)
            if res['code'] != 0:
                probs.append('exit %s%s%s: %s' % (res['code'], ' timeout' if res['timeout'] else '', ' output-cap' if res['capped'] else '', res['stderr'][-3000:]))
            probs += res['leftovers']
            if res['total_seconds'] > NATIVE_TOTAL: probs.append('invocation exceeded %ds: %ss' % (NATIVE_TOTAL, res['total_seconds']))
            if bad: probs.append('malformed output lines: %r' % bad[:3])
            if len(m) != 1: probs.append('expected exactly one matrix, got %d' % len(m))
            else:
                probs += validate_matrix(m[0], cohort_keys(c))
                all_rows += m[0].get('rows', []) if isinstance(m[0].get('rows'), list) else []
            if not summary: probs.append('no summary')
            elif type(summary.get('scratchPeakBytes')) is not int or summary['scratchPeakBytes'] > 48 << 20: probs.append('scratch peak missing or above 48MiB')
            else: ns_peak = max(ns_peak, summary['scratchPeakBytes'])
            result['problems'] += ['%s: %s' % (c, x) for x in probs]
            cohorts[c] = {'exit': res['code'], 'seconds': res['seconds'], 'totalSeconds': res['total_seconds'], 'outputBytes': budget.used, 'stderrBytes': len(res['stderr'].encode()), 'summary': summary}
        result['problems'] += envelope_problems(tree_bytes(out), canary_bytes, 0, ns_peak)
        if len(all_rows) == len(expected_controls()):
            sts = [r.get('status') for r in all_rows]
            matrix = {'rows': all_rows, 'status': 'FAIL' if 'FAIL' in sts else 'BLOCKED' if ('BLOCKED' in sts or 'MISSING' in sts) else 'PASS'}
        else:
            result['problems'].append('aggregate matrix incomplete: %d/%d rows' % (len(all_rows), len(expected_controls())))
        result['native'] = cohorts
    try:
        after = source_state()
    except RuntimeError as e:
        after = {'head': 'git-failed', 'dirty': str(e)}
    result['problems'] += source_problems(before, after, os.environ.get('GITHUB_SHA'), rfms_head)
    result['matrix'] = matrix
    result['status'] = final_status(matrix, result['problems'])
    (out / 'result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'status': result['status'], 'problems': result['problems'][:5], 'matrix': matrix and matrix['status'], 'out': str(out)}))
    return {'PASS': 0, 'FAIL': 1}.get(result['status'], 2)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--qualify', action='store_true', required=True)
    ap.add_argument('--out', type=pathlib.Path, default=pathlib.Path(os.environ.get('RUNNER_TEMP', tempfile.gettempdir())) / 'reedfs-native')
    return qualify(ap.parse_args(argv).out)


if __name__ == '__main__':
    sys.exit(main())
