/**
 * The composable half of "one deployable server, five repos" — see
 * ehr-bridge/src/ehr-bridge.module.ts for the sibling module on the other
 * side of this pattern. sentinel-stack imports these directly, alongside
 * EhrBridgeModule, into a single composed process.
 */
export { RegistryModule } from './registry/registry.module';
export { SignalsModule } from './signals/signals.module';
export { ModelModule } from './model/model.module';
export { DeliveryModule } from './delivery/delivery.module';
export { TelemetryModule, SENTINEL_TELEMETRY } from './common/telemetry.module';
