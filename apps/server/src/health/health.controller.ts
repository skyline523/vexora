import { Controller, Get } from '@nestjs/common';
import { ok, type ApiResponse } from '@alpha/shared';
import { HealthService, type HealthData } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): ApiResponse<HealthData> {
    return ok(this.healthService.getStatus());
  }
}
