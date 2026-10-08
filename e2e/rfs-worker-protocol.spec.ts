import { expect, test } from '@playwright/test';

// This is a protocol integration test, distinct from visible-control flight
// acceptance. It uses the actual worker module spawned by the running app.
test('a real browser worker rejects malformed execution messages and remains responsive', async ({ page }) => {
  const spawned = page.waitForEvent('worker', { predicate: (worker) => worker.url().includes('simulationWorker') });
  await page.goto('/');
  const url = (await spawned).url();
  const replies = await page.evaluate(async (workerUrl) => {
    const worker = new Worker(workerUrl, { type: 'module' });
    const messages = [
      { protocolVersion: 1, type: 'simulation.step.request', requestId: 'null-input', input: null },
      { protocolVersion: 99, type: 'simulation.step.request', requestId: 'unsupported-version', input: {} },
      { protocolVersion: 1, type: 'simulation.step.request', requestId: 'infinite-steps', input: { dt: 1 / 60, steps: Infinity } },
    ];
    try {
      const replies: Array<{ type: string; requestId: string; error?: { message: string } }> = [];
      for (const message of messages) {
        replies.push(await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('worker response deadline exceeded')), 5000);
          worker.onmessage = (event) => { clearTimeout(timeout); resolve(event.data); };
          worker.onerror = () => { clearTimeout(timeout); reject(new Error('uncaught worker error')); };
          worker.postMessage(message);
        }));
      }
      return replies;
    } finally { worker.terminate(); }
  }, url);
  expect(replies.map((reply) => reply.requestId)).toEqual(['null-input', 'unsupported-version', 'infinite-steps']);
  expect(replies.every((reply) => reply.type === 'simulation.step.error' && Boolean(reply.error?.message))).toBe(true);
});
