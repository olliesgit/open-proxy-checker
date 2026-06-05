/**
 * Retry with exponential backoff + jitter.
 *
 * Usage: const data = await retry(() => fetchWithTimeout(url), { maxAttempts: 3, baseMs: 500 });
 */

export async function retry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts || 3;
  const baseMs = opts.baseMs || 400;
  const factor = opts.factor || 2;
  const jitterMs = opts.jitterMs || 150;
  const shouldRetry = opts.shouldRetry != null
    ? opts.shouldRetry
    : (err) => err?.code !== "ECONNREFUSED" && err?.code !== "ENOTFOUND";

  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts - 1) break;
      if (!shouldRetry(err)) break;
      const jitter = Math.random() * jitterMs;
      const delay = Math.round(baseMs * Math.pow(factor, attempt) + jitter);
      await sleep(delay);
    }
  }
  throw lastError;
}

export function withTimeout(fn, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`Timed out after ${ms}ms`);
      err.code = "ETIMEDOUT";
      reject(err);
    }, ms);
    Promise.resolve(fn())
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
