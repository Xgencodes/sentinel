/**
 * Split out of telemetry.module.ts to break a circular import:
 * TelemetryModule imports TelemetryController, and TelemetryController
 * needs this token — if the token lived in telemetry.module.ts, that
 * import cycle left SENTINEL_TELEMETRY as `undefined` inside
 * TelemetryController at class-definition time (whichever file loads
 * second sees the other's exports mid-evaluation), which surfaced as
 * Nest's "argument at index [0] appears to be undefined at runtime" on
 * TelemetryController specifically. Every other file still imports this
 * from telemetry.module.ts, which re-exports it — only the two files in
 * the cycle need to import it from here directly.
 */
export const SENTINEL_TELEMETRY = Symbol('SENTINEL_TELEMETRY');
