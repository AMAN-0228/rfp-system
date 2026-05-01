import { TokenPayload } from '../utils/tokens';

declare global {
  namespace Express {
    interface Request {
      auth?: TokenPayload;
    }
  }
}

export {};
