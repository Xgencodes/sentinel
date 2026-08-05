import { Inject, Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { newCorrelationId, TelemetryEmitter } from '@ehr-bridge/sdk';
import { DatabaseService } from '../../database/database.service';
import {
  assessments,
  escalations,
  zoneTriggers,
} from '../../database/core-schema';
import { INFERENCE_BACKEND } from './inference.tokens';
import { InferenceBackend } from '../inference/backend.interface';
import { EscalationPolicy } from './escalation-policy';
import { buildClimateContext } from './climate-context';
import { mentionsPregnancyDangerSign, parseSeverity } from './danger-signs';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';

export interface AssessPatientRequest {
  patientId: string;
  zoneId: string;
  isAntenatal: boolean;
  prompt: string;
  language: string;
  roadAccessible: boolean;
  /** Threads an existing journey's correlationId (e.g. from an outbound
   * campaign that prompted this assessment) instead of starting a new one. */
  correlationId?: string;
}

/**
 * Orchestrates one triage turn: builds climate context from the zone's
 * latest trigger, calls the configured inference backend, and applies the
 * escalation policy (including its hard pregnancy safety floor). This is
 * link 5 (climate-weighted triage) feeding into link 6 (escalation).
 */
@Injectable()
export class AssessmentService {
  private readonly escalationPolicy = new EscalationPolicy();

  constructor(
    private readonly db: DatabaseService,
    @Inject(INFERENCE_BACKEND) private readonly backend: InferenceBackend,
    @Inject(SENTINEL_TELEMETRY) private readonly telemetry: TelemetryEmitter,
  ) {}

  async assess(request: AssessPatientRequest) {
    const database = this.db.getDb();
    const correlationId = request.correlationId ?? newCorrelationId();

    const latestTrigger = await database.query.zoneTriggers.findFirst({
      where: eq(zoneTriggers.zoneId, request.zoneId),
      orderBy: [desc(zoneTriggers.epiWeek)],
    });

    const climateContext = buildClimateContext(
      request.zoneId,
      {
        band: (latestTrigger?.band as 'low' | 'medium' | 'high') ?? 'low',
        standingWaterDays: 0,
      },
      request.roadAccessible,
    );

    const response = await this.backend.generate({
      prompt: request.prompt,
      language: request.language,
      climateContext: climateContext as unknown as Record<string, unknown>,
    });

    const severity = parseSeverity(response.text);
    const pregnancyDangerSignMentioned = mentionsPregnancyDangerSign(
      request.prompt,
    );

    const decision = this.escalationPolicy.decide({
      severity,
      isAntenatal: request.isAntenatal,
      pregnancyDangerSignMentioned,
      climateContext,
    });

    const [assessment] = await database
      .insert(assessments)
      .values({
        patientId: request.patientId,
        correlationId,
        backendId: response.backendId,
        severitySignal: severity,
        guidance: response.text,
        climateContextApplied:
          climateContext.transmissionWindow !== 'none' ||
          !climateContext.roadAccessible,
      })
      .returning();

    await this.telemetry.emit({
      type: 'assessment.completed',
      correlationId,
      emitterModule: 'sentinel-model',
      zoneId: request.zoneId,
      patientId: request.patientId,
      severitySignal: severity,
      backendId: response.backendId,
      climateContextApplied: assessment.climateContextApplied,
    });

    if (decision.action === 'escalate') {
      await database.insert(escalations).values({
        assessmentId: assessment.id,
        patientId: request.patientId,
        correlationId,
        action: decision.action,
        forcedBySafetyRule: decision.forcedBySafetyRule,
      });

      await this.telemetry.emit({
        type: 'escalation.raised',
        correlationId,
        emitterModule: 'sentinel-model',
        zoneId: request.zoneId,
        patientId: request.patientId,
        forcedBySafetyRule: decision.forcedBySafetyRule,
      });
    }

    return { correlationId, assessment, decision, response };
  }
}
