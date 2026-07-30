import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { newCorrelationId, TelemetryEmitter } from '@ehr-bridge/sdk';
import { DatabaseService } from '../../database/database.service';
import { patients, consentRecords } from '../schema';
import { CreatePatientRequest, RecordConsentRequest } from '../dto';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(SENTINEL_TELEMETRY) private readonly telemetry: TelemetryEmitter,
  ) {}

  async create(request: CreatePatientRequest) {
    const database = this.db.getDb();
    const [patient] = await database
      .insert(patients)
      .values({
        msisdn: request.msisdn,
        name: request.name,
        zoneId: request.zoneId,
        language: request.language,
        isAntenatal: request.isAntenatal,
        isUnderFiveHousehold: request.isUnderFiveHousehold,
        hasChronicCondition: request.hasChronicCondition,
        assignedChwId: request.assignedChwId,
        registrationProvenance: request.registrationProvenance,
      })
      .returning();

    await this.telemetry.emit({
      type: 'patient.registered',
      correlationId: newCorrelationId(),
      emitterModule: 'sentinel-registry',
      zoneId: patient.zoneId ?? undefined,
      patientId: patient.id,
      provenance: request.registrationProvenance,
      language: patient.language,
    });

    return patient;
  }

  async findAll() {
    const database = this.db.getDb();
    return database.query.patients.findMany();
  }

  async findOne(id: string) {
    const database = this.db.getDb();
    const patient = await database.query.patients.findFirst({
      where: eq(patients.id, id),
    });
    if (!patient) {
      throw new NotFoundException(`Patient ${id} not found`);
    }
    return patient;
  }

  async findByMsisdn(msisdn: string) {
    const database = this.db.getDb();
    return database.query.patients.findFirst({
      where: eq(patients.msisdn, msisdn),
    });
  }

  /**
   * Consent is a separate row carrying the exact text shown, not a boolean
   * flag — so what was actually agreed to survives changes to the flow copy.
   */
  async recordConsent(request: RecordConsentRequest) {
    await this.findOne(request.patientId);
    const database = this.db.getDb();

    const [record] = await database
      .insert(consentRecords)
      .values({
        patientId: request.patientId,
        channel: request.channel,
        consentTextVersion: request.consentTextVersion,
        consentText: request.consentText,
        granted: request.granted,
      })
      .returning();

    await this.telemetry.emit({
      type: 'consent.recorded',
      correlationId: newCorrelationId(),
      emitterModule: 'sentinel-registry',
      patientId: request.patientId,
      channel: request.channel,
      consentTextVersion: request.consentTextVersion,
      granted: request.granted,
    });

    return record;
  }
}
