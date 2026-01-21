import { AppError } from './AppError';

export class TooManyRequestsError extends AppError {
  constructor(message: string) {
    super(message, 429);
    this.name = 'TooManyRequestsError';
  }
}
