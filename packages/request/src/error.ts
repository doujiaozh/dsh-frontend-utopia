import type { FinalRequestConfig, UtopiaResponse } from './types.js';

export interface UtopiaErrorOptions {
  code?: string;
  message: string;
  config?: FinalRequestConfig;
  response?: UtopiaResponse;
  isTimeout?: boolean;
  isCancel?: boolean;
}

/**
 * 统一错误形态：isCancel / isTimeout 与 axios 语义一致，拦截器里一眼分辨。
 */
export class UtopiaRequestError extends Error {
  readonly code?: string;
  readonly config?: FinalRequestConfig;
  readonly response?: UtopiaResponse;
  readonly isTimeout: boolean;
  readonly isCancel: boolean;

  constructor(options: UtopiaErrorOptions) {
    super(options.message);
    this.name = 'UtopiaRequestError';
    this.code = options.code;
    this.config = options.config;
    this.response = options.response;
    this.isTimeout = !!options.isTimeout;
    this.isCancel = !!options.isCancel;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      isTimeout: this.isTimeout,
      isCancel: this.isCancel,
      status: this.response?.status
    };
  }
}
