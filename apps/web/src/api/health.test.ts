import { describe, expect, it } from 'vitest';
import { type ApiResponse } from '@alpha/shared';

describe('health response contract', () => {
  it('accepts ok payload shape', () => {
    const payload: ApiResponse<{ status: 'up'; version: string }> = {
      ok: true,
      data: { status: 'up', version: '0.1.0' },
      meta: { requestId: 'test', ts: Date.now() },
    };

    expect(payload.ok).toBe(true);
    if (payload.ok) {
      expect(payload.data.status).toBe('up');
    }
  });
});
