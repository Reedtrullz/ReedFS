#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { argv, exit, stderr, stdout } from 'node:process';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = argv[++i];
    else if (arg === '--branch') args.branch = argv[++i];
    else if (arg === '--sha') args.sha = argv[++i];
    else if (arg === '--live-url') args.liveUrl = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: node scripts/check-exact-sha-release.mjs --repo OWNER/REPO --branch BRANCH --sha COMMIT_SHA --live-url https://host/rfs-version.json\n\nVerifies an exact GitHub Actions run and live /rfs-version.json metadata for one commit. Requires gh CLI authentication plus network access to the live URL.\n`;
}

function runGh(args) {
  const binaries = ['gh', '/opt/homebrew/bin/gh'];
  let missing = null;
  for (const binary of binaries) {
    const result = spawnSync(binary, args, { encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') {
      missing = result.error;
      continue;
    }
    return { binary, result };
  }
  throw missing ?? new Error('gh CLI was not found on PATH or at /opt/homebrew/bin/gh');
}

function ghApi(path) {
  const { binary, result } = runGh(['api', path]);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${binary} api ${path} failed${detail ? `: ${detail}` : ''}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`could not parse gh api JSON for ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

function encodeQuery(value) {
  return encodeURIComponent(value);
}

async function fetchLiveJson(url) {
  const response = await globalThis.fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`live metadata fetch failed: HTTP ${response.status} ${response.statusText}`);
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`live metadata is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

function findSuccessfulRun(runs, sha) {
  return (runs.workflow_runs ?? []).find((run) => (
    run.head_sha === sha
    && run.name === 'CI/CD'
    && run.event === 'push'
    && run.status === 'completed'
    && run.conclusion === 'success'
  ));
}

function findJob(jobs, name) {
  return (jobs.jobs ?? []).find((job) => job.name === name);
}

async function main() {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
    exit(2);
  }
  if (args.help) {
    stdout.write(usage());
    return;
  }
  for (const required of ['repo', 'branch', 'sha', 'liveUrl']) {
    if (!args[required]) {
      stderr.write(`--${required.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required\n\n${usage()}`);
      exit(2);
    }
  }
  if (!/^[a-f0-9]{40}$/i.test(args.sha)) {
    stderr.write(`--sha must be a full 40-character commit SHA, got ${args.sha}\n`);
    exit(2);
  }

  const failures = [];
  let selectedRun;
  let deployJob;
  try {
    const runs = ghApi(`repos/${args.repo}/actions/runs?branch=${encodeQuery(args.branch)}&head_sha=${encodeQuery(args.sha)}&per_page=100`);
    selectedRun = findSuccessfulRun(runs, args.sha);
    if (!selectedRun) {
      failures.push(`no completed/success CI/CD push GitHub Actions run found for ${args.repo}@${args.sha} on ${args.branch}`);
    } else {
      const jobs = ghApi(`repos/${args.repo}/actions/runs/${selectedRun.id}/jobs?per_page=100`);
      deployJob = findJob(jobs, 'deploy');
      if (!deployJob) {
        failures.push(`run ${selectedRun.id} has no deploy job`);
      } else if (deployJob.status !== 'completed' || deployJob.conclusion !== 'success') {
        failures.push(`deploy job for run ${selectedRun.id} is ${deployJob.status}/${deployJob.conclusion ?? 'null'}, expected completed/success`);
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const live = await fetchLiveJson(args.liveUrl);
    if (live.commit !== args.sha) failures.push(`live commit mismatch: ${live.commit ?? '<missing>'} != ${args.sha}`);
    if (live.version !== args.sha) failures.push(`live version mismatch: ${live.version ?? '<missing>'} != ${args.sha}`);
    if (typeof live.imageRef !== 'string' || !live.imageRef.includes(`sha-${args.sha}`)) {
      failures.push(`live imageRef must include sha-${args.sha}; observed ${live.imageRef ?? '<missing>'}`);
    }
    if (typeof live.imageDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(live.imageDigest)) {
      failures.push(`live imageDigest must be a sha256 digest; observed ${live.imageDigest ?? '<missing>'}`);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (failures.length > 0) {
    stderr.write(`exact-SHA release check failed for ${args.repo}@${args.sha}:\n`);
    for (const failure of failures) stderr.write(`- ${failure}\n`);
    if (selectedRun) stderr.write(`observed run: ${selectedRun.html_url ?? selectedRun.id}\n`);
    if (deployJob) stderr.write(`observed deploy job: ${deployJob.html_url ?? deployJob.id}\n`);
    exit(1);
  }

  stdout.write(`exact-SHA release ok for ${args.repo}@${args.sha}\n`);
  stdout.write(`run: ${selectedRun.html_url}\n`);
  stdout.write(`deploy job: ${deployJob.html_url}\n`);
  stdout.write(`live: ${args.liveUrl}\n`);
}

main().catch((error) => {
  stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  exit(1);
});
