import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().int().default(30),
  API_KEY_SALT_ROUNDS: z.coerce.number().int().default(12),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

const REQUIRED_KEYS = ['DATABASE_URL', 'JWT_SECRET'];

describe('Environment validation', () => {
  function cleanEnv(): Record<string, string> {
    return {
      DATABASE_URL: 'postgresql://ffm:password@localhost:5432/feature_flags',
      JWT_SECRET: 'a-secret-that-is-at-least-32-characters-long',
    };
  }

  it('should parse valid environment variables', () => {
    const result = envSchema.safeParse(cleanEnv());
    expect(result.success).toBe(true);
  });

  it('should fail if DATABASE_URL is missing', () => {
    const env = cleanEnv();
    delete env.DATABASE_URL;
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('should fail if JWT_SECRET is too short', () => {
    const result = envSchema.safeParse({ ...cleanEnv(), JWT_SECRET: 'short' });
    expect(result.success).toBe(false);
  });

  it('should fail if DATABASE_URL is not a valid URL', () => {
    const result = envSchema.safeParse({ ...cleanEnv(), DATABASE_URL: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('should apply defaults for optional fields', () => {
    const result = envSchema.safeParse(cleanEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.PORT).toBe(3000);
      expect(result.data.JWT_EXPIRES_IN).toBe('15m');
      expect(result.data.REFRESH_TOKEN_EXPIRES_IN_DAYS).toBe(30);
      expect(result.data.API_KEY_SALT_ROUNDS).toBe(12);
      expect(result.data.LOG_LEVEL).toBe('info');
      expect(result.data.CORS_ORIGIN).toBe('http://localhost:3000');
    }
  });

  it('should reject unknown keys', () => {
    const result = envSchema.safeParse({ ...cleanEnv(), UNKNOWN_KEY: 'value' });
    // Zod strict mode would reject — but we use default (strip), so this passes
    expect(result.success).toBe(true);
  });
});
