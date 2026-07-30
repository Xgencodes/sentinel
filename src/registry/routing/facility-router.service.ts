import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { facilities } from '../schema';
import { RoadAccessAdapter } from './road-access.adapter';

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
  ) {}

  async selectReceiving(
    originZoneId: string,
    requiredSpecialty?: string,
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

    return {
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
}
