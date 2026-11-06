import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ExchangesModule } from './exchanges/exchanges.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { MarketModule } from './market/market.module';
import { ModelsModule } from './models/models.module';
import { WatchlistModule } from './watchlist/watchlist.module';

@Module({
  imports: [DatabaseModule, MarketModule, WatchlistModule, ExchangesModule, ModelsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
