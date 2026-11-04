export interface ApiMeta {
  requestId: string;
  ts: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> =
  | {
      ok: true;
      data: T;
      meta: ApiMeta;
    }
  | {
      ok: false;
      error: ApiError;
      meta: ApiMeta;
    };

function createMeta(requestId?: string): ApiMeta {
  return {
    requestId: requestId ?? crypto.randomUUID(),
    ts: Date.now(),
  };
}

export function ok<T>(data: T, requestId?: string): ApiResponse<T> {
  return {
    ok: true,
    data,
    meta: createMeta(requestId),
  };
}

export function fail(
  error: ApiError,
  requestId?: string,
): ApiResponse<never> {
  return {
    ok: false,
    error,
    meta: createMeta(requestId),
  };
}
