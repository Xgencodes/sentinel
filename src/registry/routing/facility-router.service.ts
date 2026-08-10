import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { newCorrelationId, TelemetryEmitter } from '@ehr-bridge/sdk';
import { DatabaseService } from '../../database/database.service';
import { facilities } from '../schema';
import { placements } from '../../database/core-schema';
import { RoadAccessAdapter } from './road-access.adapter';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';

export const ROAD_ACCESS_ADAPTER = Symbol('ROAD_ACCESS_ADAPTER');

export interface FacilityCandidate {
  facilityId: string;
  name: string;
  bedsAvailable: number;
  specialtyMatched: boolean;
  roadAccessible: boolean;
  score: number;
}

export interface PlacementResult {
  placementId: string | null;
  facilityId: string | null;
  bedConfirmed: boolean;
  specialtyMatched: boolean;
  roadAccessible: boolean;
  alternatives: FacilityCandidate[];
}

/**
 * Selects a receiving facility on bed availability, specialty match, and
 * road accessibility — link 7. A facility with zero beds is disqualified
 * outright; among facilities with capacity, specialty match and passable
 * roads each add to the score, so the ranking degrades predictably as
 * constraints are removed rather than failing outright.
 */
@Injectable()
export class FacilityRouterService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(ROAD_ACCESS_ADAPTER) private readonly roadAccess: RoadAccessAdapter,
    @Inject(SENTINEL_TELEMETRY) private readonly telemetry: TelemetryEmitter,
  ) {}

  async selectReceiving(
    originZoneId: string,
    requiredSpecialty?: string,
    patientId?: string,
    correlationId: string = newCorrelationId(),
  ): Promise<PlacementResult> {
    const database = this.db.getDb();
    const allFacilities = await database.query.facilities.findMany({
      with: { specialties: true },
    });

    const candidates: FacilityCandidate[] = [];

    for (const facility of allFacilities) {
      if (facility.bedsAvailable <= 0) {
        continue; // A full facility is never a viable destination.
      }

      const specialtyMatched = requiredSpecialty
        ? facility.specialties.some((s) => s.code === requiredSpecialty)
        : true;
      const roadAccessible = await this.roadAccess.isAccessible(
        originZoneId,
        facility.id,
      );

      const score =
        (specialtyMatched ? 2 : 0) +
        (roadAccessible ? 1 : 0) +
        // Small tiebreaker so more spare capacity is preferred among
        // otherwise-equal candidates.
        Math.min(facility.bedsAvailable, 10) * 0.01;

      candidates.push({
        facilityId: facility.id,
        name: facility.name,
        bedsAvailable: facility.bedsAvailable,
        specialtyMatched,
        roadAccessible,
        score,
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const selected = candidates[0];

    // Persist the placement so "current patient status" has something
    // durable to read back — this used to be computed and handed back over
    // HTTP but never written down, so there was no way to later ask "where
    // was this patient placed?"
    let placementId: string | null = null;
    if (selected && patientId) {
      const [inserted] = await database
        .insert(placements)
        .values({
          patientId,
          facilityId: selected.facilityId,
          correlationId,
          bedConfirmed: true,
          specialtyMatched: selected.specialtyMatched,
          roadAccessible: selected.roadAccessible,
        })
        .returning();
      placementId = inserted.id;

      // Consumes one bed at the destination so a second placement against
      // the same data sees reduced capacity instead of routing everyone to
      // the same "available" facility forever. Never goes negative: a
      // facility only reaches `selected` above with bedsAvailable > 0.
      await database
        .update(facilities)
        .set({ bedsAvailable: sql`${facilities.bedsAvailable} - 1` })
        .where(eq(facilities.id, selected.facilityId));

      await this.telemetry.emit({
        type: 'placement.confirmed',
        correlationId,
        emitterModule: 'sentinel-registry',
        patientId,
        facilityId: selected.facilityId,
        bedConfirmed: true,
        specialtyMatched: selected.specialtyMatched,
        roadAccessible: selected.roadAccessible,
      });
    }

    return {
      placementId,
      facilityId: selected?.facilityId ?? null,
      bedConfirmed: !!selected,
      specialtyMatched: selected?.specialtyMatched ?? false,
      roadAccessible: selected?.roadAccessible ?? false,
      alternatives: candidates,
    };
  }

  async findOne(id: string) {
    const database = this.db.getDb();
    const facility = await database.query.facilities.findFirst({
      where: eq(facilities.id, id),
    });
    if (!facility) {
      throw new NotFoundException(`Facility ${id} not found`);
    }
    return facility;
  }

  /**
   * Marks a placement's record as transferred — called after ehr-bridge's
   * own /v1/transfers has actually delivered the record (link 8). This
   * table lives in sentinel, the transfer itself happens in ehr-bridge, so
   * the caller (sentinel-stack's demo service) does both calls and reports
   * success back here; ehr-bridge has no knowledge of sentinel's schema to
   * update it directly.
   */
  async markTransferred(placementId: string) {
    const database = this.db.getDb();
    const [updated] = await database
      .update(placements)
      .set({ recordTransferredAt: new Date() })
      .where(eq(placements.id, placementId))
      .returning();
    if (!updated) {
      throw new NotFoundException(`Placement ${placementId} not found`);
    }
    return updated;
  }

  /**
   * Lets a human override the algorithm's destination pick — link 7 is a
   * suggestion, not a mandate. Mutates `placements.facilityId` directly
   * (single source of truth: PatientsService.getStatus's `latestPlacement`
   * always reflects the real current destination, not a stale suggestion
   * alongside a separate "actual" field) and corrects the bed accounting
   * `selectReceiving` already applied to the original facility.
   */
  async overrideDestination(placementId: string, newFacilityId: string) {
    const database = this.db.getDb();

    const placement = await database.query.placements.findFirst({
      where: eq(placements.id, placementId),
    });
    if (!placement) {
      throw new NotFoundException(`Placement ${placementId} not found`);
    }

    if (placement.facilityId === newFacilityId) {
      return placement; // No-op: already the current destination.
    }

    const newFacility = await this.findOne(newFacilityId);
    if (newFacility.bedsAvailable <= 0) {
      throw new BadRequestException(
        `Facility ${newFacilityId} has no available beds`,
      );
    }

    // Give the bed back to the facility this placement is moving away from.
    await database
      .update(facilities)
      .set({ bedsAvailable: sql`${facilities.bedsAvailable} + 1` })
      .where(eq(facilities.id, placement.facilityId));

    await database
      .update(facilities)
      .set({ bedsAvailable: sql`${facilities.bedsAvailable} - 1` })
      .where(eq(facilities.id, newFacilityId));

    const [updated] = await database
      .update(placements)
      .set({ facilityId: newFacilityId, overridden: true })
      .where(eq(placements.id, placementId))
      .returning();

    return updated;
  }

  /**
   * Records the treatment outcome for a placement — the visible "closing
   * the loop" moment for link 9. Every placement starts 'ongoing' by
   * default (see core-schema.ts); this is how it moves on from there.
   */
  async updateOutcome(
    placementId: string,
    status: 'ongoing' | 'recovered' | 'referred',
  ) {
    const database = this.db.getDb();
    const [updated] = await database
      .update(placements)
      .set({ outcomeStatus: status, outcomeUpdatedAt: new Date() })
      .where(eq(placements.id, placementId))
      .returning();
    if (!updated) {
      throw new NotFoundException(`Placement ${placementId} not found`);
    }

    await this.telemetry.emit({
      type: 'outcome.recorded',
      correlationId: newCorrelationId(),
      emitterModule: 'sentinel-registry',
      patientId: updated.patientId,
      facilityId: updated.facilityId,
      status,
    });

    return updated;
  }
}
