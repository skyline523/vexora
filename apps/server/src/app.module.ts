import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { MarketModule } from './market/market.module';

@Module({
  imports: [MarketModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
