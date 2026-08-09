import { Controller, Post } from '@nestjs/common';
import { DatabaseService } from './database.service';

/** Operational reset endpoint — not part of the clinical/registry surface. See DatabaseService.truncateAll. */
@Controller('v1/system')
export class DatabaseAdminController {
  constructor(private readonly db: DatabaseService) {}

  @Post('clear')
  async clear() {
    await this.db.truncateAll();
    return { cleared: true };
  }
}
