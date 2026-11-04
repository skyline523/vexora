import { describe, expect, it } from 'vitest';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns up status with version', () => {
    const service = new HealthService();
    expect(service.getStatus()).toEqual({
      status: 'up',
      version: '0.1.0',
    });
  });
});
