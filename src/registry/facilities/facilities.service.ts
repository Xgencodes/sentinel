import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { facilities, specialties, zones } from '../schema';
import { CreateFacilityRequest, UpdateBedsRequest } from '../dto';

@Injectable()
export class FacilitiesService {
  constructor(private readonly db: DatabaseService) {}

  async create(request: CreateFacilityRequest) {
    const database = this.db.getDb();

    const zone = await database.query.zones.findFirst({
      where: eq(zones.id, request.zoneId),
    });
    if (!zone) {
      throw new NotFoundException(`Zone ${request.zoneId} not found`);
    }

    const [facility] = await database
      .insert(facilities)
      .values({
        name: request.name,
        zoneId: request.zoneId,
        lat: request.lat,
        lng: request.lng,
        bedsTotal: request.bedsTotal,
        bedsAvailable: request.bedsAvailable,
        contactPhone: request.contactPhone,
      })
      .returning();

    if (request.specialties?.length) {
      await database.insert(specialties).values(
        request.specialties.map((code) => ({
          facilityId: facility.id,
          code,
        })),
      );
    }

    return this.findOne(facility.id);
  }

  async findAll() {
    const database = this.db.getDb();
    return database.query.facilities.findMany({
      with: { specialties: true, zone: true },
    });
  }

  async findOne(id: string) {
    const database = this.db.getDb();
    const facility = await database.query.facilities.findFirst({
      where: eq(facilities.id, id),
      with: { specialties: true, zone: true },
    });
    if (!facility) {
      throw new NotFoundException(`Facility ${id} not found`);
    }
    return facility;
  }

  async updateBeds(id: string, request: UpdateBedsRequest) {
    await this.findOne(id);
    const database = this.db.getDb();
    const [updated] = await database
      .update(facilities)
      .set({ bedsAvailable: request.bedsAvailable, updatedAt: new Date() })
      .where(eq(facilities.id, id))
      .returning();
    return updated;
  }
}
