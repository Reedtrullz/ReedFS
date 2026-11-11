import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
const decision = workflow.jobs.test.steps.find((step) => step.id === 'run-mode');
const condition = (job, context) => runInNewContext(
  workflow.jobs[job].if.replace(/needs\.([\w-]+)/g, "needs['$1']"),
  { ...context, always: () => true },
);
const context = (event = 'push', results = {}) => ({
  github: { event_name: event, ref: event === 'push' ? 'refs/heads/master' : 'refs/pull/225/merge' },
  vars: { RFS_CLOUDFLARE_DEPLOY_ENABLED: '1' },
  needs: {
    test: { result: 'success', outputs: { run_full_e2e: 'true' } },
    'e2e-shard': { result: 'success' },
    'docker-smoke': { result: 'success' },
    ...results,
  },
});

describe('browser qualification and delivery guards', () => {
  it('exports the decision and responds to label changes', () => {
    expect(workflow.jobs.test.outputs.run_full_e2e).toBe('${{ steps.run-mode.outputs.run_full_e2e }}');
    expect(workflow.on.pull_request.types).toEqual(expect.arrayContaining(['opened', 'synchronize', 'reopened', 'labeled', 'unlabeled']));
  });

  it.each([
    ['push', '', 'true'],
    ['pull_request', '', 'false'],
    ['pull_request', 'full-e2e', 'true'],
    ['pull_request', 'bug full-e2e maintenance', 'true'],
    ['pull_request', 'not-full-e2e full-e2e-extra', 'false'],
  ])('selects the browser suite for %s with labels %s', (event, labels, expected) => {
    const directory = mkdtempSync(join(tmpdir(), 'rfs-e2e-mode-'));
    const output = join(directory, 'output');
    try {
      const result = spawnSync('bash', ['-e', '-c', decision.run.replaceAll('${{ github.event_name }}', event)], {
        env: { ...process.env, GITHUB_EVENT_NAME: event, PR_LABELS: labels, GITHUB_OUTPUT: output },
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      const selected = Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').map((line) => line.split('=')));
      expect(selected.run_full_e2e).toBe(expected);
      expect(condition('e2e-shard', context(event, { test: { outputs: selected } }))).toBe(expected === 'true');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('permits Docker smoke on an intentional fast-lane PR only', () => {
    const fast = context('pull_request', {
      test: { result: 'success', outputs: { run_full_e2e: 'false' } },
      'e2e-shard': { result: 'skipped' },
    });
    expect(condition('docker-smoke', fast)).toBe(true);
    fast.github.event_name = 'push';
    expect(condition('docker-smoke', fast)).toBe(false);
    fast.github.event_name = 'pull_request';
    delete fast.needs.test.outputs.run_full_e2e;
    expect(condition('docker-smoke', fast)).toBe(false);
  });

  it.each(['publish', 'pages-deploy'])('%s requires all gates and a master push', (job) => {
    expect(condition(job, context())).toBe(true);
    expect(condition(job, context('pull_request'))).toBe(false);
    for (const gate of ['test', 'e2e-shard', 'docker-smoke']) {
      for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
        expect(condition(job, context('push', { [gate]: { result } })), gate + ':' + result).toBe(false);
      }
    }
    if (job === 'pages-deploy') {
      const disabled = context();
      disabled.vars.RFS_CLOUDFLARE_DEPLOY_ENABLED = '0';
      expect(condition(job, disabled)).toBe(false);
    }
  });
});
