import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdapterRegistry } from './ingestion/adapter-registry';
import { SyntheticClimateAdapter } from './ingestion/synthetic-climate.adapter';
import { IngestionService } from './ingestion/ingestion.service';
import { IngestionScheduler } from './ingestion/ingestion.scheduler';
import { IngestionController } from './ingestion/ingestion.controller';
import { FeatureTableService } from './normalization/feature-table.service';
import { ModelRegistry } from './models/model-registry';
import { ZoneTriggerService } from './zones/zone-trigger.service';
import { ALERT_NOTIFIER } from './zones/zone-trigger.tokens';
import { LogAlertNotifier } from './alerts/alert-notifier.interface';
import { ZonesSignalsController } from './api/zones.controller';
import { RiskController } from './api/risk.controller';
import { AlertsController } from './api/alerts.controller';
import { CommunityReportsService } from './community-reports/community-reports.service';
import { CommunityReportsController } from './community-reports/community-reports.controller';

/**
 * Climate signal ingestion, normalisation, the zone trigger / facility risk
 * score model, and community reports — links 1 and 2. Exported for
 * composition into sentinel-stack alongside the registry, model and
 * delivery modules.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [
    IngestionController,
    ZonesSignalsController,
    RiskController,
    AlertsController,
    CommunityReportsController,
  ],
  providers: [
    {
      provide: AdapterRegistry,
      useFactory: () => {
        const registry = new AdapterRegistry();
        // Every metric ships with a synthetic default so ingestion works
        // offline out of the box (see decision on the 15-minute clean-clone
        // bar). Real feeds are added by registering another SourceAdapter.
        registry.register(
          new SyntheticClimateAdapter('synthetic-rainfall', 'rainfall_mm', 5),
        );
        registry.register(
          new SyntheticClimateAdapter(
            'synthetic-standing-water',
            'standing_water_days',
            0,
          ),
        );
        return registry;
      },
    },
    IngestionService,
    IngestionScheduler,
    FeatureTableService,
    ModelRegistry,
    ZoneTriggerService,
    { provide: ALERT_NOTIFIER, useClass: LogAlertNotifier },
    CommunityReportsService,
  ],
  exports: [
    AdapterRegistry,
    IngestionService,
    FeatureTableService,
    ModelRegistry,
    ZoneTriggerService,
    CommunityReportsService,
  ],
})
export class SignalsModule {}
