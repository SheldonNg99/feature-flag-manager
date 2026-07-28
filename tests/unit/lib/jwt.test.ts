import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

const SECRET = 'test-secret-that-is-at-least-32-chars';

describe('JWT sign and verify', () => {
  it('signs a token with correct payload', () => {
    const payload = { sub: 'user-123', role: 'ADMIN' };
    const token = jwt.sign(payload, SECRET, { expiresIn: '24h' });

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifies a valid token', () => {
    const payload = { sub: 'user-456', role: 'SRE' };
    const token = jwt.sign(payload, SECRET, { expiresIn: '24h' });
    const decoded = jwt.verify(token, SECRET) as jwt.JwtPayload;

    expect(decoded.sub).toBe('user-456');
    expect(decoded.role).toBe('SRE');
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it('rejects token with wrong secret', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'ADMIN' }, SECRET, { expiresIn: '24h' });

    expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
  });

  it('rejects expired token', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'ADMIN' }, SECRET, { expiresIn: '0s' });

    // small delay to ensure expiry
    expect(() => jwt.verify(token, SECRET)).toThrow();
  });

  it('token has exp set correctly for 24h', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'ADMIN' }, SECRET, { expiresIn: '24h' });
    const decoded = jwt.verify(token, SECRET) as jwt.JwtPayload;

    const now = Math.floor(Date.now() / 1000);
    const expected24h = 24 * 60 * 60;

    // exp should be ~24h from now (within 10s tolerance)
    expect(decoded.exp! - decoded.iat!).toBeCloseTo(expected24h, -1);
    expect(decoded.exp).toBeGreaterThan(now);
    expect(decoded.exp).toBeLessThanOrEqual(now + expected24h + 10);
  });
});
