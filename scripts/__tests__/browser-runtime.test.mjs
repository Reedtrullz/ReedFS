import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
const lock = parse(readFileSync('pnpm-lock.yaml', 'utf8'));
const version = lock.importers['.'].devDependencies['@playwright/test'].version;

it.each(['test', 'e2e-shard'])('%s uses a matching immutable browser image without live APT installation', (name) => {
  const job = workflow.jobs[name];
  expect(job.container.image).toMatch(/^mcr\.microsoft\.com\/playwright:v\d+\.\d+\.\d+-noble@sha256:[a-f0-9]{64}$/);
  expect(job.container.image.startsWith(`mcr.microsoft.com/playwright:v${version}-noble@`)).toBe(true);
  expect(job.container.image).toBe(workflow.jobs.test.container.image);
  expect(job.container.options).toContain('--shm-size=1g');
  expect(job.steps.find((step) => step.uses?.startsWith('actions/setup-node@')).with['node-version']).toBe(22);
  const commands = job.steps.map((step) => step.run || '').join('\n');
  expect(commands).not.toMatch(/--with-deps|install-deps|apt-get|\bapt\s/);
  const probe = job.steps.find((step) => step.name === 'Verify bundled Chromium');
  expect(probe.run).toContain('chromium.launch()');
  expect(probe.run).toContain('await browser.close()');
  expect(probe['continue-on-error']).toBeUndefined();
  if (name === 'test') {
    expect(job.steps.find((step) => step.id === 'run-mode').shell).toBe('bash');
    for (const gate of ['pnpm run test', 'pnpm run test:visual', 'pnpm run test:e2e:pwa:run']) {
      expect(job.steps.some((step) => step.run === gate)).toBe(true);
    }
  } else {
    expect(job.strategy.matrix.shard).toEqual([1, 2, 3]);
    expect(job.steps.find((step) => step.id === 'browser').run).toBe('pnpm run test:e2e --shard=${{ matrix.shard }}/3');
  }
});
