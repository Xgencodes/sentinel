import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { newCorrelationId, TelemetryEmitter } from '@ehr-bridge/sdk';
import { DatabaseService } from '../../database/database.service';
import { patients, consentRecords } from '../schema';
import {
  assessments,
  escalations,
  placements,
  messages,
} from '../../database/core-schema';
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
      with: { zone: true, assignedChw: true },
    });
    if (!patient) {
      throw new NotFoundException(`Patient ${id} not found`);
    }
    return patient;
  }

  /**
   * "Current status" for the dashboard's patient detail view: the patient's
   * registry record plus the latest read from each downstream stage of the
   * chain — triage, escalation, placement — and their recent message
   * history. Each is independently optional (a patient may not have been
   * triaged yet), so this composes the latest-of-each rather than assuming
   * the full chain has run.
   */
  async getStatus(id: string) {
    const patient = await this.findOne(id);
    const database = this.db.getDb();

    const [latestAssessment, latestEscalation, latestPlacement, recentMessages] =
      await Promise.all([
        database.query.assessments.findFirst({
          where: eq(assessments.patientId, id),
          orderBy: [desc(assessments.createdAt)],
        }),
        database.query.escalations.findFirst({
          where: eq(escalations.patientId, id),
          orderBy: [desc(escalations.createdAt)],
        }),
        database.query.placements.findFirst({
          where: eq(placements.patientId, id),
          orderBy: [desc(placements.createdAt)],
          with: { facility: true },
        }),
        database.query.messages.findMany({
          where: eq(messages.patientId, id),
          orderBy: [desc(messages.createdAt)],
          limit: 5,
        }),
      ]);

    return {
      patient,
      latestAssessment: latestAssessment ?? null,
      latestEscalation: latestEscalation ?? null,
      latestPlacement: latestPlacement ?? null,
      recentMessages,
    };
  }

  /**
   * Marks the start of monitoring/treatment at the receiving facility —
   * link 9, post-placement. Emits `treatment.started`, defined in the SDK's
   * telemetry contract since the very first version but never actually
   * emitted anywhere until now. No dedicated outcomes table exists yet
   * (see ROADMAP.md), so this is telemetry-only: it marks the moment
   * monitoring begins without claiming to collect the outcome data itself.
   */
  async startTreatment(
    patientId: string,
    facilityId: string,
    correlationId: string = newCorrelationId(),
  ) {
    await this.findOne(patientId);

    await this.telemetry.emit({
      type: 'treatment.started',
      correlationId,
      emitterModule: 'sentinel-registry',
      patientId,
      facilityId,
    });

    return { patientId, facilityId, correlationId, monitoringStarted: true };
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
