import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { facilities, facilityEhrIdentities, specialties, zones } from '../schema';
import { CreateFacilityRequest, UpdateBedsRequest } from '../dto';
import { CryptoUtil } from '../../common/crypto.util';

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

  /**
   * A facility's own ehr-bridge identity (see facilityEhrIdentities' own
   * comment for why this is a separate table, admin-gated, not a column on
   * `facilities`). Returns null rather than throwing when none exists yet —
   * WorkflowService.ensureFacilityIdentity uses that to decide whether to
   * provision one.
   */
  async getEhrIdentity(facilityId: string) {
    const database = this.db.getDb();
    const row = await database.query.facilityEhrIdentities.findFirst({
      where: eq(facilityEhrIdentities.facilityId, facilityId),
    });
    if (!row) {
      return null;
    }
    return {
      ehrSystemId: row.ehrSystemId,
      partnerKey: row.partnerKey,
      secret: CryptoUtil.decrypt(row.partnerSecretEncrypted),
    };
  }

  async setEhrIdentity(
    facilityId: string,
    identity: { ehrSystemId: string; partnerKey: string; secret: string },
  ) {
    await this.findOne(facilityId);
    const database = this.db.getDb();
    const values = {
      facilityId,
      ehrSystemId: identity.ehrSystemId,
      partnerKey: identity.partnerKey,
      partnerSecretEncrypted: CryptoUtil.encrypt(identity.secret),
    };
    const [saved] = await database
      .insert(facilityEhrIdentities)
      .values(values)
      .onConflictDoUpdate({
        target: facilityEhrIdentities.facilityId,
        set: values,
      })
      .returning();
    return { ehrSystemId: saved.ehrSystemId, partnerKey: saved.partnerKey };
  }
}
