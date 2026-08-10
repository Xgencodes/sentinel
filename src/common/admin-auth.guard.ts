import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { CryptoUtil } from './crypto.util';

/**
 * Gates the facility EHR-identity endpoints, which hold ehr-bridge partner
 * secrets — the one place in sentinel's otherwise-unauthenticated reference
 * deployment where that matters. Mirrors ehr-bridge's own AdminAuthGuard
 * (src/guards/admin-auth.guard.ts in that repo) exactly, reimplemented
 * locally rather than imported: cross-package `instanceof`/DI doesn't work
 * in this composed process (see CrossPackageExceptionFilter's doc comment
 * in sentinel-stack), so guards can't be shared as NestJS providers across
 * these repos either. Reuses ADMIN_API_KEY — already configured for
 * ehr-bridge's own admin API in the same process.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly logger = new Logger(AdminAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const provided = this.extractKey(request);

    if (!provided) {
      throw new UnauthorizedException('Missing admin credentials');
    }

    const expected = process.env.ADMIN_API_KEY;

    if (!expected) {
      this.logger.error(
        'ADMIN_API_KEY is not configured; refusing all admin requests',
      );
      throw new UnauthorizedException('Admin API is not configured');
    }

    if (!CryptoUtil.safeEqual(provided, expected)) {
      this.logger.warn('Rejected admin request with an invalid API key');
      throw new UnauthorizedException('Invalid admin credentials');
    }

    return true;
  }

  private extractKey(request: FastifyRequest): string | undefined {
    const headerKey = request.headers['x-admin-api-key'];
    if (typeof headerKey === 'string' && headerKey.length > 0) {
      return headerKey;
    }

    const authorization = request.headers.authorization;
    if (
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
    ) {
      return authorization.slice('Bearer '.length);
    }

    return undefined;
  }
}
