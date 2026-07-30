import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ZonesService } from './zones/zones.service';
import { ZonesController } from './zones/zones.controller';
import { FacilitiesService } from './facilities/facilities.service';
import { FacilitiesController } from './facilities/facilities.controller';
import { ProvidersService } from './providers/providers.service';
import { ProvidersController } from './providers/providers.controller';
import { PatientsService } from './patients/patients.service';
import { PatientsController } from './patients/patients.controller';
import {
  CohortResolverService,
  COHORT_RULES,
} from './cohort/cohort-resolver.service';
import { DEFAULT_COHORT_RULES } from './cohort/cohort-rule.interface';
import { CohortController } from './cohort/cohort.controller';
import {
  FacilityRouterService,
  ROAD_ACCESS_ADAPTER,
} from './routing/facility-router.service';
import { SyntheticRoadAccessAdapter } from './routing/road-access.adapter';
import { RoutingController } from './routing/routing.controller';

/**
 * The population and network registry (link 0), plus the two things that
 * depend directly on it: cohort resolution (link 3) and facility selection
 * under constraint (link 7). Exported as a NestJS module per the "one
 * deployable server, N repos" pattern — sentinel-stack composes this
 * alongside signals, model and delivery into a single process.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [
    ZonesController,
    FacilitiesController,
    ProvidersController,
    PatientsController,
    CohortController,
    RoutingController,
  ],
  providers: [
    ZonesService,
    FacilitiesService,
    ProvidersService,
    PatientsService,
    CohortResolverService,
    { provide: COHORT_RULES, useValue: DEFAULT_COHORT_RULES },
    FacilityRouterService,
    { provide: ROAD_ACCESS_ADAPTER, useClass: SyntheticRoadAccessAdapter },
  ],
  exports: [
    ZonesService,
    FacilitiesService,
    ProvidersService,
    PatientsService,
    CohortResolverService,
    FacilityRouterService,
  ],
})
export class RegistryModule {}
