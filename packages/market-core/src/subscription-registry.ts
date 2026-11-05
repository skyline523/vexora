import type { Subscription } from '@vexora/shared';

interface Entry {
  refs: Set<string>;
  upstream: Subscription;
}

/**
 * Reference-counted upstream subscriptions.
 * The upstream is opened once and closed when the last subscriber leaves.
 */
export class SubscriptionRegistry {
  private readonly entries = new Map<string, Entry>();

  acquire(key: string, subscriberId: string, open: () => Subscription): void {
    const existing = this.entries.get(key);
    if (existing) {
      existing.refs.add(subscriberId);
      return;
    }

    const entry: Entry = {
      refs: new Set([subscriberId]),
      upstream: { unsubscribe() {} },
    };
    this.entries.set(key, entry);
    try {
      entry.upstream = open();
    } catch (error) {
      this.entries.delete(key);
      throw error;
    }
  }

  /** @returns true when the upstream subscription was closed. */
  release(key: string, subscriberId: string): boolean {
    const entry = this.entries.get(key);
    if (!entry || !entry.refs.delete(subscriberId)) return false;
    if (entry.refs.size > 0) return false;
    entry.upstream.unsubscribe();
    this.entries.delete(key);
    return true;
  }

  isActive(key: string): boolean {
    return (this.entries.get(key)?.refs.size ?? 0) > 0;
  }

  releaseAll(): void {
    for (const entry of this.entries.values()) {
      entry.upstream.unsubscribe();
    }
    this.entries.clear();
  }
}
