import { Controller, Post, Body, Header, Inject } from '@nestjs/common';
import { newCorrelationId, TelemetryEmitter } from '@ehr-bridge/sdk';
import { UssdFlowRouter } from './flow-router';
import { UssdSessionStore } from './ussd-session.store';
import { SENTINEL_TELEMETRY } from '../../common/telemetry.module';

interface AfricasTalkingUssdRequest {
  sessionId: string;
  serviceCode: string;
  phoneNumber: string;
  /** AT's convention: every input in the session, joined by '*'. Only the last segment is used — see flow.interface.ts. */
  text: string;
}

/**
 * Implements Africa's Talking's USSD webhook contract directly: a plain-text
 * response body prefixed CON (continue) or END (terminate). This is the
 * inbound half of requirements 4 and 6 — patient self-registration and CHW
 * actions, both reachable with a feature phone and no app install.
 */
@Controller('v1/ussd')
export class UssdController {
  constructor(
    private readonly router: UssdFlowRouter,
    private readonly sessions: UssdSessionStore,
    @Inject(SENTINEL_TELEMETRY) private readonly telemetry: TelemetryEmitter,
  ) {}

  @Post()
  @Header('Content-Type', 'text/plain')
  async handle(@Body() body: AfricasTalkingUssdRequest): Promise<string> {
    const { sessionId, phoneNumber, text } = body;
    const lastInput = text.split('*').pop() ?? '';

    const existing = await this.sessions.find(sessionId);

    if (!existing) {
      const result = await this.router.start(phoneNumber);
      await this.sessions.create(
        sessionId,
        phoneNumber,
        this.router.flowId,
        result.state,
      );
      await this.telemetry.emit({
        type: 'ussd.session.started',
        correlationId: newCorrelationId(),
        emitterModule: 'sentinel-delivery',
        sessionId,
        flowId: this.router.flowId,
      });

      if (!result.continueSession) {
        // A flow that resolves in a single screen (e.g. the CHW visit
        // list) — the session both starts and ends on this request.
        await this.sessions.complete(sessionId, result.state);
        await this.telemetry.emit({
          type: 'ussd.session.completed',
          correlationId: newCorrelationId(),
          emitterModule: 'sentinel-delivery',
          sessionId,
          flowId: this.router.flowId,
        });
      }

      return result.text;
    }

    const result = await this.router.handle(phoneNumber, existing, lastInput);

    if (result.continueSession) {
      await this.sessions.update(sessionId, result.state);
    } else {
      await this.sessions.complete(sessionId, result.state);
      await this.telemetry.emit({
        type: 'ussd.session.completed',
        correlationId: newCorrelationId(),
        emitterModule: 'sentinel-delivery',
        sessionId,
        flowId: this.router.flowId,
      });
    }

    return result.text;
  }
}
