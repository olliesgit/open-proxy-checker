/**
 * Circuit breaker for proxy validation pool.
 *
 * After N consecutive failures in a worker, the worker backs off.
 * If recent global failure rate exceeds 60%, reduce concurrency.
 */

export function createCircuitBreaker(opts = {}) {
  const failureThreshold = opts.failureThreshold || 10;
  const backoffMs = opts.backoffMs || 250;
  const maxBackoffMs = opts.maxBackoffMs || 4000;
  let globalRecent = 0;     // total checks
  let globalFails = 0;      // fails in recent window
  let effectiveConcurrency = opts.initialConcurrency || 50;
  const recentWindow = [];

  return {
    getConcurrency() {
      return effectiveConcurrency;
    },
    recordSuccess() {
      globalRecent++;
      globalFails = 0;
      recentWindow.push(0);
      if (recentWindow.length > 50) recentWindow.shift();
      maybeRestore();
    },
    recordFailure() {
      globalRecent++;
      globalFails++;
      recentWindow.push(1);
      if (recentWindow.length > 50) recentWindow.shift();
      maybeThrottle();
    },
    computeBackoff() {
      // exponential-ish backoff for per-worker waits
      return Math.min(backoffMs + globalFails * 100, maxBackoffMs);
    },
  };

  function maybeThrottle() {
    const window = recentWindow.slice(-30);
    const rate = window.length ? window.reduce((a, b) => a + b, 0) / window.length : 0;
    if (rate > 0.6 && effectiveConcurrency > 5) {
      effectiveConcurrency = Math.max(5, Math.floor(effectiveConcurrency * 0.8));
    }
    // If local failure threshold exceeded, back off more
    if (globalFails >= failureThreshold && effectiveConcurrency > 3) {
      effectiveConcurrency = Math.max(3, Math.floor(effectiveConcurrency * 0.7));
    }
  }

  function maybeRestore() {
    const window = recentWindow.slice(-10);
    if (window.length < 6) return;
    const rate = window.reduce((a, b) => a + b, 0) / window.length;
    // Restore when less than 40% of recent checks failed
    if (rate < 0.4 && effectiveConcurrency < opts.initialConcurrency) {
      effectiveConcurrency = Math.min(opts.initialConcurrency, effectiveConcurrency + 3);
    }
  }
}
