import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';

const VALID_KEY = 'admin-api-key-for-tests';

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminAuthGuard', () => {
  let guard: AdminAuthGuard;
  const originalKey = process.env.ADMIN_API_KEY;

  beforeEach(() => {
    guard = new AdminAuthGuard();
    process.env.ADMIN_API_KEY = VALID_KEY;
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.ADMIN_API_KEY;
    } else {
      process.env.ADMIN_API_KEY = originalKey;
    }
  });

  describe('rejects', () => {
    it('a request with no credentials', () => {
      expect(() => guard.canActivate(contextWithHeaders({}))).toThrow(
        UnauthorizedException,
      );
    });

    it('an invalid x-admin-api-key', () => {
      const context = contextWithHeaders({ 'x-admin-api-key': 'wrong-key' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('an invalid bearer token', () => {
      const context = contextWithHeaders({ authorization: 'Bearer wrong-key' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('a non-bearer authorization scheme carrying the right value', () => {
      const context = contextWithHeaders({
        authorization: `Basic ${VALID_KEY}`,
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('an empty key header', () => {
      const context = contextWithHeaders({ 'x-admin-api-key': '' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    // Fail closed: an unconfigured server must not accept arbitrary keys.
    it('every request when ADMIN_API_KEY is unset', () => {
      delete process.env.ADMIN_API_KEY;
      const context = contextWithHeaders({ 'x-admin-api-key': 'anything' });

      expect(() => guard.canActivate(context)).toThrow(
        /Admin API is not configured/,
      );
    });
  });

  describe('accepts', () => {
    it('a valid x-admin-api-key', () => {
      const context = contextWithHeaders({ 'x-admin-api-key': VALID_KEY });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('a valid bearer token', () => {
      const context = contextWithHeaders({
        authorization: `Bearer ${VALID_KEY}`,
      });

      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
