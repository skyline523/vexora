import { Injectable } from '@nestjs/common';
import { APP_VERSION } from '@alpha/shared';

export interface HealthData {
  status: 'up';
  version: string;
}

@Injectable()
export class HealthService {
  getStatus(): HealthData {
    return {
      status: 'up',
      version: APP_VERSION,
    };
  }
}
