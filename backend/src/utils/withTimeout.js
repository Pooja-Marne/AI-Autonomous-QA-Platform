/**
 * Races `promise` against a timer. If the timer wins, the returned promise
 * rejects with a TimeoutError (the original promise is left running in the
 * background — Node has no way to force-cancel an arbitrary in-flight
 * await, but callers no longer wait on it, which is what actually matters:
 * a caller awaiting this never hangs longer than `ms`).
 *
 * This exists because nothing upstream of it can be trusted to always
 * settle: a browser launch can hang in a sandboxed container, an AI SDK
 * call can hang past its documented default, a child process can become a
 * zombie. Without an outer ceiling, any one of those turns into a test run
 * (or an HTTP request) stuck forever with no error, no log line, nothing —
 * exactly the "stuck on Running" symptom this fixes.
 */
class TimeoutError extends Error {
  constructor(label, ms) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.ms = ms;
  }
}

function withTimeout(promise, ms, label = 'Operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { withTimeout, TimeoutError };
