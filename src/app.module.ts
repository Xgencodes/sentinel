import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TelemetryModule } from './common/telemetry.module';
import { RegistryModule } from './registry/registry.module';
import { SignalsModule } from './signals/signals.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TelemetryModule,
    RegistryModule,
    SignalsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
