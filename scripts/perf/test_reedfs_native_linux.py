import base64, hashlib, importlib.util, json, os, pathlib, subprocess, sys, tempfile, types, unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('native_linux', HERE / 'reedfs-native-linux.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
def kill_group(p):
    try: os.killpg(p.pid, 9)
    except ProcessLookupError: pass  # sudo_kill likewise ignores an already-empty group


def run(code, limit=5, cap=1 << 16):
    return m.run_bounded([sys.executable, '-c', code], limit=limit, budget=m.Budget(cap), kill=kill_group)


class Bounded(unittest.TestCase):
    def test_success_and_primary_error_text_preserved(self):
        r = run('import sys; print("ok"); sys.stderr.write("PRIMARY-ERROR " * 50); sys.exit(3)')
        self.assertEqual(r['code'], 3)
        self.assertIn('ok', r['stdout'])
        self.assertEqual(r['stderr'].count('PRIMARY-ERROR'), 50)

    def test_flood_is_cut_by_cap(self):
        r = run('import sys\nwhile True: sys.stdout.write("x" * 65536)', cap=100000)
        self.assertTrue(r['capped'])
        self.assertLessEqual(len(r['stdout']), 100000)

    def test_hung_command_is_killed(self):
        r = run('import time; time.sleep(60)', limit=1)
        self.assertTrue(r['timeout'])
        self.assertLess(r['seconds'], 15)


class Guard(unittest.TestCase):
    def test_frozen_constants_hash(self):
        self.assertIn('SCRIPT', m.load_guard())

    def test_judge_rejects_misleading_success(self):
        clean = {'leftovers': [], 'code': 0, 'timeout': False, 'capped': False, 'seconds': 1, 'stdout': '', 'stderr': ''}
        egress_open = dict(clean, stdout='{"192.0.2.1": "CONNECTED", "1.1.1.1": "ConnectionRefusedError", "loopback": "OK"}')
        self.assertIn('denial missing', m.judge_guard('EGRESS', egress_open))
        egress_ok = dict(clean, stdout='{"192.0.2.1": "TimeoutError", "1.1.1.1": "OSError", "loopback": "OK"}')
        self.assertIsNone(m.judge_guard('EGRESS', egress_ok))
        self.assertIn('cleanup', m.judge_guard('EGRESS', dict(egress_ok, leftovers=['process mentioning scratch survived'])))
        self.assertIn('not cut', m.judge_guard('FLOOD', clean))
        self.assertIn('unparseable', m.judge_guard('WRITES', dict(clean, stdout='garbage')))

    def test_argv_refuses_root_and_masks_rfms(self):
        g = m.load_guard()
        args = dict(scratch='/s', root='/r', shared='/r/../RFMS/shared', home='/h', limit=5, size='64m', cmd=['node', 'x'], env={'A': '1'}, rfms_git='/r/../RFMS/.git')
        if os.getuid() == 0:
            with self.assertRaises(SystemExit):
                m.ns_argv(g, **args)
        else:
            a = m.ns_argv(g, **args)
            self.assertEqual(a[:3], ['sudo', '-n', 'unshare'])
            self.assertIn('--net', a)
            self.assertIn('/r/../RFMS/.git', a)
            self.assertEqual(a[a.index('env') + 1], '-i')


class Source(unittest.TestCase):
    def test_dirty_stale_changed_and_wrong_rfms_are_problems(self):
        ok = {'head': 'a', 'dirty': ''}
        self.assertEqual(m.source_problems(ok, ok, 'a', m.RFMS_COMMIT), [])
        self.assertEqual(len(m.source_problems({'head': 'a', 'dirty': 'M x'}, {'head': 'a', 'dirty': 'M x'}, 'a', m.RFMS_COMMIT)), 1)
        self.assertIn('stale', m.source_problems(ok, ok, 'b', m.RFMS_COMMIT)[0])
        self.assertIn('changed', m.source_problems(ok, {'head': 'a', 'dirty': '?? y'}, 'a', m.RFMS_COMMIT)[0])
        self.assertIn('pinned', m.source_problems(ok, ok, 'a', 'zzz')[0])

    def test_git_state_detects_dirty(self):
        with tempfile.TemporaryDirectory() as d:
            for c in (['init', '-q'], ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x']):
                subprocess.run(['git', *c], cwd=d, check=True)
            self.assertEqual(m.source_state(pathlib.Path(d))['dirty'], '')
            pathlib.Path(d, 'f').write_text('x')
            self.assertTrue(m.source_state(pathlib.Path(d))['dirty'])


class Output(unittest.TestCase):
    def test_malformed_lines_and_missing_matrix_are_not_pass(self):
        recs, bad = m.parse_native('{"kind":"control"}\nnot json\n')
        self.assertEqual((len(recs), len(bad)), (1, 1))
        self.assertEqual(m.final_status(None, []), 'BLOCKED')
        self.assertEqual(m.final_status({'status': 'PASS'}, ['x']), 'FAIL')
        self.assertEqual(m.final_status({'status': 'PASS'}, []), 'FAIL')  # fake PASS with no rows
        self.assertEqual(m.final_status(good_matrix(), []), 'PASS')


def good_matrix(status='PASS'):
    return {'status': status, 'rows': [{'key': k, 'status': 'PASS', 'evidence': {'e': 1}, 'reason': None} for k in m.expected_controls()]}


CLEAN = {'leftovers': [], 'code': 0, 'timeout': False, 'capped': False, 'seconds': 1, 'stdout': '', 'stderr': ''}


def judged(name, obj, kind=None):
    return m.judge_guard(name, dict(CLEAN, stdout=json.dumps(obj)), kind)


class Strict(unittest.TestCase):
    def test_matrix_forgery_is_rejected(self):
        keys = m.expected_controls()
        self.assertEqual(m.validate_matrix(good_matrix(), keys), [])
        g = good_matrix(); g['rows'].pop()
        self.assertTrue(m.validate_matrix(g, keys))
        g = good_matrix(); g['rows'].append(dict(g['rows'][0]))
        self.assertTrue(any('duplicate' in x for x in m.validate_matrix(g, keys)))
        g = good_matrix(); g['rows'].append({'key': 'x:y', 'status': 'PASS', 'evidence': {'a': 1}})
        self.assertTrue(any('unknown' in x for x in m.validate_matrix(g, keys)))
        g = good_matrix(); g['rows'][0]['evidence'] = None
        self.assertTrue(any('without evidence' in x for x in m.validate_matrix(g, keys)))
        g = good_matrix(); g['rows'][0].update(status='FAIL', evidence=None, reason='r')
        self.assertTrue(any('does not follow' in x for x in m.validate_matrix(g, keys)))
        g = good_matrix(); g['rows'][0]['status'] = 'OK'
        self.assertTrue(any('bad status' in x for x in m.validate_matrix(g, keys)))
        self.assertEqual(m.final_status(g, []), 'FAIL')
        self.assertTrue(m.validate_matrix('PASS', keys))

    def test_four_cohorts_partition_expected(self):
        self.assertEqual(sorted(k for c in m.COHORTS for k in m.cohort_keys(c)), sorted(m.expected_controls()))
        self.assertEqual(len(set(m.expected_controls())), len(m.expected_controls()))

    def test_guard_observations_must_be_complete_and_exact(self):
        priv = {'home_canary': 'ENOENT', 'git_head': 'ENOENT', 'outside': {'checkout': 30, 'home': 30, 'host_dir': 'ABSENT'}}
        self.assertIsNone(judged('PRIVATE', priv))
        self.assertTrue(judged('PRIVATE', {k: v for k, v in priv.items() if k != 'git_head'}))
        self.assertTrue(judged('PRIVATE', dict(priv, extra=1)))
        self.assertTrue(judged('PRIVATE', dict(priv, outside={'checkout': 30, 'home': 30})))
        caps = {k: '0000000000000000' for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')}
        pv = {'nnp': 1, 'caps': caps, 'sudo': 'DENIED', 'setuid0': 'EPERM', 'mount': 'DENIED'}
        self.assertIsNone(judged('PRIVS', pv))
        self.assertTrue(judged('PRIVS', dict(pv, caps={})))
        self.assertTrue(judged('PRIVS', dict(pv, caps=dict(caps, CapEff='0000000000000001'))))
        w = {'checkout': 30, 'home': 30, 'scratch': 'WRITABLE'}
        self.assertIsNone(judged('WRITES', w))
        self.assertTrue(judged('WRITES', {'checkout': 30, 'scratch': 'WRITABLE'}))
        self.assertTrue(judged('WRITES', dict(w, checkout='WRITABLE')))
        self.assertIsNone(judged('OVERLIMIT', {'errno': 28, 'mib': 4}))
        self.assertTrue(judged('OVERLIMIT', {'errno': 28, 'mib': 199}))
        self.assertTrue(judged('OVERLIMIT', {'errno': None, 'mib': 3}))
        self.assertTrue(judged('OVERLIMIT', {'errno': 28}))

    def test_rfms_git_actual_type_fails_closed(self):
        D = {'kind': 'dir', 'head': 'ENOENT', 'self': None, 'err': None}
        C = {'kind': 'chr', 'head': None, 'self': 'EMPTY', 'err': None}
        self.assertIsNone(judged('RFMS', D, 'dir'))
        self.assertTrue(judged('RFMS', dict(D, head='READ'), 'dir'))
        self.assertIsNone(judged('RFMS', C, 'file'))
        self.assertTrue(judged('RFMS', dict(C, self='READ'), 'file'))
        self.assertTrue(judged('RFMS', D, 'file'))
        self.assertTrue(judged('RFMS', C, None))

    def test_screenshots_allowlist_traversal_base64_hash_and_required(self):
        raw = b'jpeg-bytes'

        def shot(name, **kw):
            return dict({'kind': 'screenshot', 'name': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'base64': base64.b64encode(raw).decode()}, **kw)
        with tempfile.TemporaryDirectory() as d:
            out = pathlib.Path(d)
            ok = [shot('layout-desktop-main'), shot('final-desktop-main')]
            self.assertEqual(m.check_screenshots(ok, 'desktop-main', out), [])
            self.assertTrue((out / 'layout-desktop-main.jpg').exists())
            for bad in (shot('../evil'), shot('/abs/x'), shot('layout-narrow-main'), shot('final-desktop-main', base64='!!!notb64'),
                        shot('final-desktop-main', sha256='0' * 64), shot('final-desktop-main', bytes=1), shot('final-desktop-main', base64='')):
                self.assertTrue(m.check_screenshots([ok[0], bad], 'desktop-main', out), bad['name'])
            self.assertTrue(m.check_screenshots([ok[0]], 'desktop-main', out))
            big = b'x' * (m.SCREENSHOT_CAP + 1)
            self.assertTrue(m.check_screenshots([ok[0], shot('final-desktop-main', base64=base64.b64encode(big).decode(), bytes=len(big), sha256=hashlib.sha256(big).hexdigest())], 'desktop-main', out))
            self.assertFalse(list(out.glob('*evil*')))

    def test_git_helper_rejects_failure(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(RuntimeError):
                m.git('rev-parse', 'HEAD', cwd=pathlib.Path(d))
            with self.assertRaises(RuntimeError):
                m.git('no-such-subcommand', cwd=m.ROOT)

    def test_empty_stale_rev_is_still_stale(self):
        ok = {'head': 'a', 'dirty': ''}
        self.assertIn('stale', m.source_problems(ok, ok, '', m.RFMS_COMMIT)[0])

    def test_scratch_envelope_constants(self):
        self.assertEqual(m.SCRATCH_SIZE, '48m')
        self.assertLessEqual((48 << 20) + m.PARENT_CAP, 64 << 20)
        self.assertIn('"$scratch/home" "$scratch/tmp"', m.load_guard()['SCRIPT'])

class Boundary(unittest.TestCase):
    """Second correction: exact denial values, cleanup gating, descendant pipes, deadline, hidden RFMS, envelope."""

    def test_invalid_denial_values_are_rejected(self):
        o = {'checkout': 30, 'home': 13, 'host_dir': 'ABSENT'}
        priv = {'home_canary': 'ENOENT', 'git_head': 'ENOENT', 'outside': o}
        self.assertIsNone(judged('PRIVATE', priv))
        for bad in (dict(priv, home_canary='BANANA'), dict(priv, git_head='READ'), dict(priv, git_head=''),
                    dict(priv, outside=dict(o, checkout=0)), dict(priv, outside=dict(o, home=-1)),
                    dict(priv, outside=dict(o, home=True)), dict(priv, outside=dict(o, checkout=9999))):
            self.assertTrue(judged('PRIVATE', bad), bad)
        for bad in ({'checkout': 0, 'home': 30, 'scratch': 'WRITABLE'}, {'checkout': 30, 'home': True, 'scratch': 'WRITABLE'}, {'checkout': 30, 'home': 30, 'scratch': 'EROFS'}):
            self.assertTrue(judged('WRITES', bad), bad)
        caps = {k: '0000000000000000' for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')}
        pv = {'nnp': 1, 'caps': caps, 'sudo': 'DENIED', 'setuid0': 'EPERM', 'mount': 'DENIED'}
        for bad in (dict(pv, nnp=True), dict(pv, setuid0=None), dict(pv, setuid0='EACCES'), dict(pv, setuid0='OK'), dict(pv, extra=1)):
            self.assertTrue(judged('PRIVS', bad), bad)
        for bad in ({'192.0.2.1': '', '1.1.1.1': 'OSError', 'loopback': 'OK'}, {'192.0.2.1': 'BANANA', '1.1.1.1': 'OSError', 'loopback': 'OK'},
                    {'192.0.2.1': 'OSError', '1.1.1.1': None, 'loopback': 'OK'}, {'192.0.2.1': 'OSError', '1.1.1.1': 'OSError', 'loopback': 'FAIL'}):
            self.assertTrue(judged('EGRESS', bad), bad)
        self.assertTrue(judged('OVERLIMIT', {'errno': True, 'mib': 2}))

    def test_cleanup_never_removes_scratch_with_survivor_or_uncertainty(self):
        rc = lambda n: (lambda *a, **k: types.SimpleNamespace(returncode=n))

        def boom(*a, **k): raise OSError('no pgrep')

        def leftovers(run, mounts='', unterminated=False):
            with tempfile.TemporaryDirectory() as d:
                s = os.path.join(d, 'scratch'); os.mkdir(s)
                read = mounts if callable(mounts) else (lambda self, *a, **k: mounts.replace('SCRATCH', s))
                with mock.patch.object(m.subprocess, 'run', run), mock.patch.object(m.pathlib.Path, 'read_text', read):
                    return m.leftovers(s, unterminated=unterminated), os.path.exists(s)

        def mounts_err(self, *a, **k): raise OSError('no mounts')
        self.assertEqual(leftovers(rc(1)), ([], False))
        for run, mounts, unt, word in ((rc(0), '', False, 'survived'), (rc(2), '', False, 'failed'), (boom, '', False, 'unavailable'),
                                       (rc(1), 'tmpfs SCRATCH', False, 'mount survived'), (rc(1), mounts_err, False, 'unavailable'), (rc(1), '', True, 'still open')):
            probs, exists = leftovers(run, mounts, unt)
            self.assertTrue(any(word in p for p in probs), (word, probs))
            self.assertTrue(exists, word)

    def test_leader_exits_with_descendant_holding_pipe_same_group(self):
        r = run('import subprocess, sys; subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])', limit=5)
        self.assertFalse(r['unterminated'])
        self.assertLess(r['seconds'], 12)

    def test_unreachable_descendant_is_reported_unterminated_within_deadline(self):
        code = 'import subprocess, sys; p = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(40)"], start_new_session=True); print(p.pid, flush=True)'
        r = m.run_bounded([sys.executable, '-c', code], limit=1, total=m.SHUTDOWN + 1, budget=m.Budget(1 << 16), kill=kill_group)
        try:
            self.assertTrue(r['unterminated'])
            self.assertLessEqual(r['seconds'], m.SHUTDOWN + 1.5)
        finally:
            os.kill(int(r['stdout'].split()[0]), 9)

    def test_streams_share_one_combined_budget_and_stderr_is_preserved(self):
        r = run('import sys; sys.stdout.write("o" * 900); sys.stderr.write("PRIMARY " * 110); sys.exit(2)', cap=1000)
        self.assertTrue(r['capped'])
        self.assertLessEqual(len(r['stdout']) + len(r['stderr']), 1000)
        r = run('import sys; sys.stdout.write("o" * 600); sys.stderr.write("PRIMARY " * 20); sys.exit(2)', cap=1000)
        self.assertFalse(r['capped'])
        self.assertEqual((len(r['stdout']), r['stderr'].count('PRIMARY')), (600, 20))
        r = run('import sys; sys.stderr.write("e" * 5000)', cap=1000)
        self.assertTrue(r['capped'])
        self.assertEqual(len(r['stderr']), 1000)

    def test_combined_output_never_exceeds_one_mib(self):
        r = run('import sys; sys.stdout.write("o" * 650000); sys.stderr.write("e" * 650000)', cap=1 << 20)
        self.assertTrue(r['capped'])
        self.assertLessEqual(len(r['stdout']) + len(r['stderr']), 1 << 20)

    def test_stdout_flood_keeps_already_emitted_primary_stderr(self):
        r = run('import sys; sys.stderr.write("PRIMARY-ERROR " * 100); sys.stderr.flush(); sys.stdout.write("o" * 5000000)', cap=1 << 20)
        self.assertTrue(r['capped'])
        self.assertEqual(r['stderr'].count('PRIMARY-ERROR'), 100)
        self.assertLessEqual(len(r['stdout']) + len(r['stderr']), 1 << 20)

    def test_whole_invocation_deadline(self):
        self.assertLessEqual(m.NATIVE_LIMIT + 10 + m.SHUTDOWN, m.NATIVE_TOTAL)
        r = m.run_bounded([sys.executable, '-c', 'import time; time.sleep(60)'], limit=999, total=m.SHUTDOWN + 2, budget=m.Budget(1 << 16), kill=kill_group)
        self.assertTrue(r['timeout'])
        self.assertLessEqual(r['seconds'], m.SHUTDOWN + 2)

    def test_hidden_rfms_parent_accepts_only_exact_enoent(self):
        ab = {'kind': 'absent', 'head': None, 'self': None, 'err': 'ENOENT'}
        hid = lambda j: m.judge_guard('RFMS', dict(CLEAN, stdout=json.dumps(j)), 'dir', True)
        self.assertTrue(judged('RFMS', ab, 'dir'))
        self.assertIsNone(hid(ab))
        for bad in (dict(ab, err='ENOTDIR'), dict(ab, err=None), {'kind': 'unknown', 'head': None, 'self': None, 'err': 'EACCES'},
                    {'kind': 'dir', 'head': 'READ', 'self': None, 'err': None}):
            self.assertTrue(hid(bad), bad)

    def test_rfms_probe_distinguishes_enoent_from_other_errors(self):
        def probe(p): return json.loads(subprocess.run([sys.executable, '-c', m.RFMS_PROBE, p], capture_output=True, text=True, check=True).stdout)
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, 'f'); open(f, 'w').close()
            self.assertEqual((probe(os.path.join(d, 'none'))['kind'], probe(os.path.join(d, 'none'))['err']), ('absent', 'ENOENT'))
            self.assertEqual(probe(f + '/x'), {'kind': 'unknown', 'head': None, 'self': None, 'err': 'ENOTDIR'})
            self.assertEqual(probe(d)['head'], 'ENOENT')

    def test_mask_preamble_makes_mounts_private_first(self):
        self.assertLess(m.RFMS_MASK.index('make-rprivate'), m.RFMS_MASK.index('mount -t tmpfs'))

    def test_envelope_and_stale_output(self):
        self.assertEqual(m.envelope_problems(1 << 20, 1, 0, 48 << 20), [])
        self.assertTrue(m.envelope_problems(m.PARENT_CAP + 1, 0, 0, 0))
        self.assertTrue(m.envelope_problems(0, 0, 0, (48 << 20) + 1))
        self.assertTrue(m.envelope_problems(m.PARENT_CAP - 1, 0, 2, 48 << 20))
        with tempfile.TemporaryDirectory() as d:
            pathlib.Path(d, 'old.json').write_text('{}')
            self.assertEqual(m.qualify(pathlib.Path(d)), 1)
            self.assertEqual(sorted(os.listdir(d)), ['old.json'])


if __name__ == '__main__':
    unittest.main()
