import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireRole } from '../../../../src/api/middleware/rbac.js';
import { UnauthorizedError, ForbiddenError } from '../../../../src/lib/errors.js';

function mockReq(user?: { id: string; role: string }): Request {
  return { user } as Request;
}

function mockRes(): Response {
  return {} as Response;
}

describe('requireRole middleware', () => {
  it('throws UnauthorizedError if no req.user', () => {
    const middleware = requireRole('ADMIN');
    const req = mockReq(undefined);
    const res = mockRes();

    expect(() => middleware(req, res, () => {})).toThrow(UnauthorizedError);
  });

  it('throws ForbiddenError if role not in allowed list', () => {
    const middleware = requireRole('ADMIN');
    const req = mockReq({ id: '1', role: 'VIEWER' });
    const res = mockRes();

    expect(() => middleware(req, res, () => {})).toThrow(ForbiddenError);
  });

  it('calls next() if role is in allowed list', () => {
    const middleware = requireRole('ADMIN', 'SRE');
    const req = mockReq({ id: '1', role: 'SRE' });
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('works with single role', () => {
    const middleware = requireRole('ADMIN');
    const req = mockReq({ id: '1', role: 'ADMIN' });
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('works with multiple roles - first match', () => {
    const middleware = requireRole('VIEWER', 'SRE', 'ADMIN');
    const req = mockReq({ id: '1', role: 'VIEWER' });
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects SUPPORT_ENGINEER when only SRE allowed', () => {
    const middleware = requireRole('SRE');
    const req = mockReq({ id: '1', role: 'SUPPORT_ENGINEER' });
    const res = mockRes();

    expect(() => middleware(req, res, () => {})).toThrow(ForbiddenError);
  });
});
