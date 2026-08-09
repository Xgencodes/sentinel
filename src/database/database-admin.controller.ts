import { Controller, Post } from '@nestjs/common';
import { DatabaseService } from './database.service';

/** Dev/demo convenience — not part of the product surface. See DatabaseService.truncateAll. */
@Controller('v1/demo-data')
export class DatabaseAdminController {
  constructor(private readonly db: DatabaseService) {}

  @Post('clear')
  async clear() {
    await this.db.truncateAll();
    return { cleared: true };
  }
}
