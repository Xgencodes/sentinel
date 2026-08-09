import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { DatabaseAdminController } from './database-admin.controller';

@Module({
  controllers: [DatabaseAdminController],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
