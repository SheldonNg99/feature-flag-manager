import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
  UnauthorizedError,
  InvalidCredentialsError,
} from '../../../src/lib/errors.js';

describe('Error hierarchy', () => {
  it('AppError has correct properties', () => {
    const err = new AppError('test', 'TEST_CODE', 500, { extra: true });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST_CODE');
    expect(err.statusCode).toBe(500);
    expect(err.details).toEqual({ extra: true });
    expect(err.name).toBe('AppError');
  });

  it('NotFoundError has 404 status', () => {
    const err = new NotFoundError('Customer', 'acme');
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe("Customer 'acme' not found");
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });

  it('ConflictError has 409 status', () => {
    const err = new ConflictError('Already exists');
    expect(err.code).toBe('CONFLICT');
    expect(err.statusCode).toBe(409);
  });

  it('ValidationError has 400 status with details', () => {
    const err = new ValidationError('Bad input', { field: 'email' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: 'email' });
  });

  it('ForbiddenError has 403 status', () => {
    const err = new ForbiddenError();
    expect(err.code).toBe('FORBIDDEN');
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Insufficient permissions');
  });

  it('ForbiddenError accepts custom message', () => {
    const err = new ForbiddenError('Custom message');
    expect(err.message).toBe('Custom message');
  });

  it('UnauthorizedError has 401 status', () => {
    const err = new UnauthorizedError();
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Authentication required');
  });

  it('UnauthorizedError accepts custom message', () => {
    const err = new UnauthorizedError('Custom');
    expect(err.message).toBe('Custom');
  });

  it('InvalidCredentialsError has 401 status', () => {
    const err = new InvalidCredentialsError();
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Invalid email or password');
  });

  it('all errors are catchable as AppError', () => {
    const errors: AppError[] = [
      new NotFoundError('A', 'B'),
      new ConflictError('C'),
      new ValidationError('D', {}),
      new ForbiddenError(),
      new UnauthorizedError(),
      new InvalidCredentialsError(),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
      expect(typeof err.code).toBe('string');
      expect(typeof err.statusCode).toBe('number');
    }
  });
});
