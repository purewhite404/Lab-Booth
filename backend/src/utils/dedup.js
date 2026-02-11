export class PurchaseDeduplicator {
  constructor(windowMs = Number(process.env.DEDUP_WINDOW_MS || 5000)) {
    this.windowMs = windowMs;
    this.recentKeys = new Map();

    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - this.windowMs;
      for (const [key, ts] of this.recentKeys) {
        if (ts < cutoff) this.recentKeys.delete(key);
      }
    }, Math.max(this.windowMs, 2000));

    this.cleanupInterval.unref?.();
  }

  makeKey(memberId, productIds) {
    const ids = Array.isArray(productIds)
      ? [...productIds].map((n) => Number(n)).sort((a, b) => a - b)
      : [];
    return `${memberId}|${ids.join(",")}`;
  }

  isDuplicate(key, now = Date.now()) {
    const last = this.recentKeys.get(key);
    return Boolean(last && now - last < this.windowMs);
  }

  mark(key, now = Date.now()) {
    this.recentKeys.set(key, now);
  }

  release(key) {
    this.recentKeys.delete(key);
  }
}
