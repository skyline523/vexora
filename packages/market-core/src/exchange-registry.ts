import type { ExchangeAdapter, ExchangeId } from '@vexora/shared';

export class ExchangeRegistry {
  private readonly adapters = new Map<ExchangeId, ExchangeAdapter>();

  register(adapter: ExchangeAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Exchange adapter already registered for ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(exchange: ExchangeId): ExchangeAdapter {
    const adapter = this.adapters.get(exchange);
    if (!adapter) {
      throw new Error(`No exchange adapter registered for ${exchange}`);
    }
    return adapter;
  }

  list(): ExchangeAdapter[] {
    return [...this.adapters.values()];
  }
}
