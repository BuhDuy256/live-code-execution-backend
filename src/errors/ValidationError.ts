import { AppError } from './AppError';

export class ValidationError extends AppError {
  public readonly errors: any[];

  constructor(message: string = 'Validation failed', errors: any[] = []) {
    super(message, 422);
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
