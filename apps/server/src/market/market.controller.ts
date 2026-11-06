import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MarketDataEngine } from '@vexora/market-core';
import { ok } from '@vexora/shared';
import {
  parseInstrumentsQuery,
  type InstrumentsQuery,
} from './parse-instruments-query';
import { parseKlineQuery, type KlineQuery } from './parse-kline-query';
import { parseOrderBookQuery, type OrderBookQuery } from './parse-orderbook-query';
import { parseTickersQuery, type TickersQuery } from './parse-tickers-query';

@Controller('markets')
export class MarketsController {
  constructor(private readonly engine: MarketDataEngine) {}

  @Get('tickers')
  async getTickers(@Query() query: TickersQuery) {
    let symbols;
    try {
      symbols = parseTickersQuery(query);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Bad request');
    }

    const tickers = await this.engine.getTickers(symbols);
    return ok({ tickers });
  }

  @Get('margin-leverage')
  async getMarginLeverage() {
    const leverage = await this.engine.getSpotMarginLeverage('binance');
    return ok({ leverage });
  }

  @Get('instruments')
  async getInstruments(@Query() query: InstrumentsQuery) {
    let params;
    try {
      params = parseInstrumentsQuery(query);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Bad request');
    }

    const instruments = await this.engine.searchInstruments({
      exchange: params.exchange,
      marketType: params.marketType,
      query: params.query,
      quote: params.quote,
      limit: params.limit,
    });

    return ok({
      exchange: params.exchange,
      marketType: params.marketType,
      quote: params.quote,
      instruments,
    });
  }

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
