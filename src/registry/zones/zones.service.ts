import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { zones } from '../schema';
import { CreateZoneRequest } from '../dto';

@Injectable()
export class ZonesService {
  constructor(private readonly db: DatabaseService) {}

  async create(request: CreateZoneRequest) {
    const database = this.db.getDb();
    const [zone] = await database.insert(zones).values(request).returning();
    return zone;
  }

  async findAll() {
    const database = this.db.getDb();
    return database.query.zones.findMany();
  }

  async findOne(id: string) {
    const database = this.db.getDb();
    const zone = await database.query.zones.findFirst({
      where: eq(zones.id, id),
    });
    if (!zone) {
      throw new NotFoundException(`Zone ${id} not found`);
    }
    return zone;
  }
}
