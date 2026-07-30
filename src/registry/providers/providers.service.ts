import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { providers } from '../schema';
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
}
