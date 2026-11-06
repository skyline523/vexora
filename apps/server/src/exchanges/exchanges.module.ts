import { Module } from '@nestjs/common';
import { ExchangesController } from './exchanges.controller';

@Module({
  controllers: [ExchangesController],
})
export class ExchangesModule {}
