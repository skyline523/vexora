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
        const adapter = await createBinanceAdapter({
          logger: createLogger('binance', { level: 'info' }),
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
