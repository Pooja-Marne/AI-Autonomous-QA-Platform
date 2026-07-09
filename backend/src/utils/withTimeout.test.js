// Run with: node --test src/utils/withTimeout.test.js  (from backend/)
// or:       npm test                                    (from backend/)
//
// This exercises the exact mechanism that fixes "test runs get stuck on
// Running": before this fix, nothing upstream of a test run had a ceiling,
// so a hung browser launch / AI call / child process left the DB row on
// "running"/"healing" forever with no error logged anywhere. These tests
// prove that a promise which NEVER settles (the worst case — a real hang,
// not just a slow response) still causes the caller to receive a
// TimeoutError within the configured bound, and that the exact catch
// pattern used in playwrightRunner.service.js turns that into a logged,
// terminal status instead of an indefinite hang.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withTimeout, TimeoutError } = require('./withTimeout');

test('withTimeout resolves normally when the underlying promise settles first', async () => {
  const result = await withTimeout(Promise.resolve('ok'), 200, 'quick op');
  assert.equal(result, 'ok');
});

test('withTimeout propagates a real rejection from the underlying promise (not masked as a timeout)', async () => {
  await assert.rejects(
    () => withTimeout(Promise.reject(new Error('boom')), 200, 'quick op'),
    /boom/
  );
});

test('withTimeout rejects with TimeoutError when the promise never settles — the core fix for "stuck on Running"', async () => {
  const neverResolves = new Promise(() => {}); // simulates a hung browser launch / zombie child process
  const startedAt = Date.now();

  await assert.rejects(
    () => withTimeout(neverResolves, 50, 'stuck operation'),
    (err) => {
      assert.ok(err instanceof TimeoutError, 'must be a TimeoutError, not a generic error');
      assert.match(err.message, /stuck operation timed out after 50ms/);
      return true;
    }
  );

  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 500, `must reject close to the configured bound, not hang — took ${elapsed}ms`);
});

test('the watchdog pattern used in playwrightRunner.service.js logs and reaches a terminal state instead of freezing', async () => {
  const logs = [];
  const log = (...args) => logs.push(args.join(' '));

  // Mirrors startPlaywrightRun's real catch block: on timeout, log the
  // error and flip the run to a terminal DB status. Simulated here with a
  // plain variable standing in for the `test_runs.status` column.
  let dbStatus = 'running';
  const hangingPipeline = new Promise(() => {}); // never settles — the exact failure mode being fixed

  await withTimeout(hangingPipeline, 50, 'Playwright run abc123').catch((err) => {
    log('[Playwright Runner] Fatal error:', err.message);
    dbStatus = 'failed';
  });

  assert.equal(dbStatus, 'failed', 'run must reach a terminal status, never stay "running" forever');
  assert.ok(logs.length === 1, 'the timeout must be logged, not swallowed silently');
  assert.match(logs[0], /Fatal error.*Playwright run abc123 timed out after 50ms/);
});
