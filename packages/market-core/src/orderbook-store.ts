import type { OrderBookSnapshot } from '@vexora/shared';

export class OrderBookStore {
  private readonly books = new Map<string, OrderBookSnapshot>();

  /** Replace the book for this symbol. Bids descend, asks ascend. */
  set(snapshot: OrderBookSnapshot): OrderBookSnapshot {
    const stored: OrderBookSnapshot = {
      ...snapshot,
      bids: [...snapshot.bids]
        .filter((level) => level.qty > 0)
        .sort((left, right) => right.price - left.price),
      asks: [...snapshot.asks]
        .filter((level) => level.qty > 0)
        .sort((left, right) => left.price - right.price),
    };
    this.books.set(snapshot.symbolId, stored);
    return {
      ...stored,
      bids: stored.bids.map((level) => ({ ...level })),
      asks: stored.asks.map((level) => ({ ...level })),
    };
  }

  get(symbolId: string): OrderBookSnapshot | undefined {
    const book = this.books.get(symbolId);
    if (!book) return undefined;
    return {
      ...book,
      bids: book.bids.map((level) => ({ ...level })),
      asks: book.asks.map((level) => ({ ...level })),
    };
  }
}
