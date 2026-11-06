import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MarketDataEngine } from '@vexora/market-core';
import { ok } from '@vexora/shared';
import { parseKlineQuery, type KlineQuery } from './parse-kline-query';
import { parseOrderBookQuery, type OrderBookQuery } from './parse-orderbook-query';

@Controller('markets')
export class MarketsController {
  constructor(private readonly engine: MarketDataEngine) {}

  @Get('klines')
  async getKlines(@Query() query: KlineQuery) {
    let params;
    try {
      params = parseKlineQuery(query);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Bad request');
    }

    const klines = await this.engine.loadKlines(params);
    return ok({
      symbolId: params.symbol.symbolId,
      interval: params.interval,
      klines,
    });
  }

  @Get('orderbook')
  async getOrderBook(@Query() query: OrderBookQuery) {
    let params;
    try {
      params = parseOrderBookQuery(query);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Bad request');
    }

    const book = await this.engine.refreshOrderBook(params.symbol, params.depth);
    return ok(book);
  }
}
