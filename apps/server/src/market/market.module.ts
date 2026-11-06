import { createBinanceAdapter } from '@vexora/exchange-adapter-binance';
import { MarketDataEngine } from '@vexora/market-core';
import { createLogger } from '@vexora/shared';
import { Module } from '@nestjs/common';
import { MarketsController } from './market.controller';
import { MarketStreamService } from './market-stream.service';

@Module({
  controllers: [MarketsController],
  providers: [
    {
      provide: MarketDataEngine,
      useFactory: async (): Promise<MarketDataEngine> => {
        const spotRest = process.env.BINANCE_SPOT_REST_BASE;
        const futuresRest = process.env.BINANCE_FUTURES_REST_BASE;
        const spotWs = process.env.BINANCE_SPOT_WS_BASE;
        const futuresWs = process.env.BINANCE_FUTURES_WS_BASE;
        const adapter = await createBinanceAdapter({
          logger: createLogger('binance', { level: 'info' }),
          rest: {
            bases: {
              ...(spotRest ? { spot: spotRest } : {}),
              ...(futuresRest ? { usdt_perpetual: futuresRest } : {}),
            },
          },
          ws: {
            bases: {
              ...(spotWs ? { spot: spotWs } : {}),
              ...(futuresWs ? { usdt_perpetual: futuresWs } : {}),
            },
          },
        });
        return new MarketDataEngine({
          adapters: [adapter],
          logger: createLogger('market-core', { level: 'info' }),
        });
      },
    },
    MarketStreamService,
  ],
})
export class MarketModule {}
