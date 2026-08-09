import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { providers, patients } from '../schema';
import { messages, communityReports } from '../../database/core-schema';
import { CreateProviderRequest } from '../dto';

@Injectable()
export class ProvidersService {
  constructor(private readonly db: DatabaseService) {}

  async create(request: CreateProviderRequest) {
    const database = this.db.getDb();
    const [provider] = await database
      .insert(providers)
      .values({
        name: request.name,
        role: request.role,
        phone: request.phone,
        facilityId: request.facilityId,
        catchmentZoneId: request.catchmentZoneId,
        languages: request.languages ?? ['en'],
      })
      .returning();
    return provider;
  }

  async findAll(role?: 'doctor' | 'chw') {
    const database = this.db.getDb();
    return database.query.providers.findMany({
      where: role ? eq(providers.role, role) : undefined,
      with: { facility: true, catchmentZone: true },
    });
  }

  async findOne(id: string) {
    const database = this.db.getDb();
    const provider = await database.query.providers.findFirst({
      where: eq(providers.id, id),
      with: { facility: true, catchmentZone: true },
    });
    if (!provider) {
      throw new NotFoundException(`Provider ${id} not found`);
    }
    return provider;
  }

  /** CHWs assigned to a given catchment zone — the visit-list source. */
  async findChwsByZone(zoneId: string) {
    const database = this.db.getDb();
    return database.query.providers.findMany({
      where: eq(providers.catchmentZoneId, zoneId),
    });
  }

  /**
   * A CHW's activity feed for the dashboard's provider detail view: their
   * current caseload (patients assigned to them), the message history
   * dispatched to them, and any community reports they've verified in the
   * field. Each is independently optional — a newly-registered CHW may have
   * none of these yet.
   */
  async getActivity(id: string) {
    await this.findOne(id);
    const database = this.db.getDb();

    const [caseload, messageHistory, verifiedReports] = await Promise.all([
      database.query.patients.findMany({
        where: eq(patients.assignedChwId, id),
      }),
      database.query.messages.findMany({
        where: eq(messages.chwId, id),
        orderBy: [desc(messages.createdAt)],
        limit: 20,
      }),
      database.query.communityReports.findMany({
        where: eq(communityReports.verifiedByChwId, id),
        orderBy: [desc(communityReports.createdAt)],
      }),
    ]);

    return { caseload, messageHistory, verifiedReports };
  }
}
