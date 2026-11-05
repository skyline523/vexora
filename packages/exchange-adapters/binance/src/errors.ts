export class BinanceApiError extends Error {
  readonly status: number;
  readonly code: number | string;
  readonly retryable: boolean;

  constructor(input: {
    message: string;
    status: number;
    code?: number | string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = 'BinanceApiError';
    this.status = input.status;
    this.code = input.code ?? input.status;
    this.retryable =
      input.retryable ??
      (input.status === 429 || input.status === 418 || input.status >= 500);
  }
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 418 || status >= 500;
}
