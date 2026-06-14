#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { argv, exit, stderr, stdout } from 'node:process';

function parseArgs(argv) {
  const args = {
    required: [],
    requireAdmins: false,
    forbidForcePush: false,
    forbidDelete: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = argv[++i];
    else if (arg === '--branch') args.branch = argv[++i];
    else if (arg === '--required') args.required = (argv[++i] ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    else if (arg === '--require-admins') args.requireAdmins = true;
    else if (arg === '--forbid-force-push') args.forbidForcePush = true;
    else if (arg === '--forbid-delete') args.forbidDelete = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: node scripts/check-branch-protection.mjs --repo OWNER/REPO --branch BRANCH --required a,b,c [--require-admins] [--forbid-force-push] [--forbid-delete]\n\nRead-only GitHub branch-protection verifier. Requires gh CLI authentication with repo metadata access.\n`;
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

function enabledFlag(value) {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && 'enabled' in value) return Boolean(value.enabled);
  return false;
}

function collectRequiredContexts(protection) {
  const statusChecks = protection.required_status_checks;
  const contexts = new Set();
  for (const context of statusChecks?.contexts ?? []) contexts.add(context);
  for (const check of statusChecks?.checks ?? []) {
    if (check?.context) contexts.add(check.context);
  }
  return contexts;
}

function main() {
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
  if (!args.repo || !args.branch) {
    stderr.write(`--repo and --branch are required\n\n${usage()}`);
    exit(2);
  }

  const failures = [];
  let protection;
  try {
    protection = ghApi(`repos/${args.repo}/branches/${encodeURIComponent(args.branch)}/protection`);
  } catch (error) {
    stderr.write(`branch protection check failed: ${error instanceof Error ? error.message : String(error)}\n`);
    exit(1);
  }

  const contexts = collectRequiredContexts(protection);
  const strict = Boolean(protection.required_status_checks?.strict);
  if (args.required.length > 0 && !protection.required_status_checks) {
    failures.push('required status checks are not enabled');
  }
  if (args.required.length > 0 && !strict) {
    failures.push('required status checks must require branches to be up to date before merging');
  }
  for (const requiredContext of args.required) {
    if (!contexts.has(requiredContext)) {
      failures.push(`missing required status check context: ${requiredContext}`);
    }
  }
  if (args.requireAdmins && !enabledFlag(protection.enforce_admins)) {
    failures.push('branch protection must enforce rules for administrators');
  }
  if (args.forbidForcePush && enabledFlag(protection.allow_force_pushes)) {
    failures.push('force pushes must be disabled');
  }
  if (args.forbidDelete && enabledFlag(protection.allow_deletions)) {
    failures.push('branch deletion must be disabled');
  }

  if (failures.length > 0) {
    stderr.write(`branch protection check failed for ${args.repo}@${args.branch}:\n`);
    for (const failure of failures) stderr.write(`- ${failure}\n`);
    stderr.write(`observed required contexts: ${JSON.stringify([...contexts].sort())}\n`);
    exit(1);
  }

  stdout.write(`branch protection ok for ${args.repo}@${args.branch}: required contexts ${JSON.stringify([...contexts].sort())}\n`);
}

main();
