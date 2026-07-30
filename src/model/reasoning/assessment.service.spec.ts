import { Test, TestingModule } from '@nestjs/testing';
import { InMemoryTelemetryEmitter } from '@ehr-bridge/sdk';
import { AssessmentService } from './assessment.service';
import { INFERENCE_BACKEND } from './inference.tokens';
import { MockInferenceBackend } from '../inference/mock.backend';
import { DatabaseService } from '../../database/database.service';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';

function buildDbStub(latestTrigger: { band: string } | undefined) {
  const inserted: Record<string, any[]> = { assessments: [], escalations: [] };
  let assessmentCounter = 0;

  return {
    inserted,
    stub: {
      getDb: () => ({
        query: {
          zoneTriggers: {
            findFirst: jest.fn().mockResolvedValue(latestTrigger),
          },
        },
        insert: (_table: unknown) => ({
          values: (values: any) => {
            // Distinguish assessments vs escalations by shape.
            const key = 'guidance' in values ? 'assessments' : 'escalations';
            const row =
              key === 'assessments'
                ? { id: `assess-${++assessmentCounter}`, ...values }
                : values;
            inserted[key].push(row);
            return {
              returning: () => Promise.resolve([row]),
            };
          },
        }),
      }),
    },
  };
}

describe('AssessmentService', () => {
  let telemetry: InMemoryTelemetryEmitter;

  async function buildService(latestTrigger: { band: string } | undefined) {
    telemetry = new InMemoryTelemetryEmitter();
    const { stub, inserted } = buildDbStub(latestTrigger);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentService,
        { provide: DatabaseService, useValue: stub },
        { provide: INFERENCE_BACKEND, useClass: MockInferenceBackend },
        { provide: SENTINEL_TELEMETRY, useValue: telemetry },
      ],
    }).compile();

    return { service: module.get(AssessmentService), inserted };
  }

  it('does not escalate routine symptoms in a calm zone', async () => {
    const { service, inserted } = await buildService({ band: 'low' });

    const result = await service.assess({
      patientId: 'p1',
      zoneId: 'z1',
      isAntenatal: false,
      prompt: 'mild tiredness, otherwise feeling fine',
      language: 'en',
      roadAccessible: true,
    });

    expect(result.decision.action).toBe('guidance');
    expect(inserted.escalations).toHaveLength(0);
  });

  it('escalates a pregnancy danger sign end to end, even with a routine-sounding model response', async () => {
    const { service, inserted } = await buildService({ band: 'low' });

    const result = await service.assess({
      patientId: 'p1',
      zoneId: 'z1',
      isAntenatal: true,
      prompt: 'I am having severe headache and blurred vision',
      language: 'en',
      roadAccessible: true,
    });

    expect(result.decision.action).toBe('escalate');
    expect(result.decision.forcedBySafetyRule).toBe(
      'pregnancy-danger-sign-floor',
    );
    expect(inserted.escalations).toHaveLength(1);
    expect(inserted.escalations[0].forcedBySafetyRule).toBe(
      'pregnancy-danger-sign-floor',
    );
  });

  it('produces a different decision for identical symptom text depending on the zone trigger band', async () => {
    const calm = await buildService({ band: 'low' });
    const flooded = await buildService({ band: 'high' });

    const prompt = 'fever for two days, no other symptoms';

    const calmResult = await calm.service.assess({
      patientId: 'p1',
      zoneId: 'z1',
      isAntenatal: false,
      prompt,
      language: 'en',
      roadAccessible: true,
    });
    const floodResult = await flooded.service.assess({
      patientId: 'p1',
      zoneId: 'z1',
      isAntenatal: false,
      prompt,
      language: 'en',
      roadAccessible: false,
    });

    expect(calmResult.decision.action).not.toBe(floodResult.decision.action);
  });

  it('emits an assessment.completed event and, on escalation, an escalation.raised event sharing the same correlationId', async () => {
    const { service } = await buildService({ band: 'low' });

    const result = await service.assess({
      patientId: 'p1',
      zoneId: 'z1',
      isAntenatal: true,
      prompt: 'severe bleeding',
      language: 'en',
      roadAccessible: true,
    });

    const journey = telemetry.timeline(result.correlationId);
    expect(journey.map((e) => e.type)).toEqual([
      'assessment.completed',
      'escalation.raised',
    ]);
  });

  it('responds in the requested language via the mock backend', async () => {
    const { service } = await buildService({ band: 'low' });

    const result = await service.assess({
      patientId: 'p1',
      zoneId: 'z1',
      isAntenatal: false,
      prompt: 'mild headache',
      language: 'tw',
      roadAccessible: true,
    });

    expect(result.response.text).not.toMatch(
      /^\[SEVERITY: (low|high)\] Thank you/,
    ); // not the English copy
  });
});
