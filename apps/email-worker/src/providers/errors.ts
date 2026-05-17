export class ResendPermanentError extends Error {
  name = 'ResendPermanentError';
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

export class ResendTransientError extends Error {
  name = 'ResendTransientError';
  constructor(message: string, public statusCode?: number) {
    super(message);
  }
}
