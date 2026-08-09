import { Global, Module } from '@nestjs/common';
import {
  LogTelemetryEmitter,
  InMemoryTelemetryEmitter,
  TelemetryEmitter,
} from '@ehr-bridge/sdk';
import { TelemetryController } from './telemetry.controller';
import { SENTINEL_TELEMETRY } from './telemetry.tokens';

export { SENTINEL_TELEMETRY };

/**
 * Every module emits Sentinel events (see @ehr-bridge/sdk/telemetry) through
 * this single injected instance, so tests can swap in
 * InMemoryTelemetryEmitter and reconstruct a whole journey by correlationId.
 *
 * Global so it doesn't have to be re-imported into every feature module.
 *
 * Reads process.env directly rather than injecting @nestjs/config's
 * ConfigService: this module is compiled inside the `sentinel` package but
 * also gets pulled into host apps (e.g. sentinel-stack) that install their
 * own separate copy of @nestjs/config. NestJS DI matches providers by class
 * reference, so a ConfigService from one package's node_modules can never
 * satisfy an `inject: [ConfigService]` from another package's compiled
 * code, even at the same version — that cross-package DI produces an
 * UnknownDependenciesException at boot. process.env has no such identity
 * problem.
 */
@Global()
@Module({
  controllers: [TelemetryController],
  providers: [
    {
      provide: SENTINEL_TELEMETRY,
      useFactory: (): TelemetryEmitter => {
        if (process.env.TELEMETRY_MODE === 'memory') {
          return new InMemoryTelemetryEmitter();
        }
        return new LogTelemetryEmitter();
      },
    },
  ],
  exports: [SENTINEL_TELEMETRY],
})
export class TelemetryModule {}
