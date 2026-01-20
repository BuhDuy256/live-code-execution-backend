import { AppError } from './AppError';

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, false);
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}
