import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { ussdSessions } from '../../database/core-schema';
import { UssdSessionState } from './flow.interface';

/**
 * Persists flow state by the provider's session id. AT's own accumulated
 * `text` field is unreliable for anything but the shallowest menus (see
 * flow.interface.ts), so every step round-trips through this store instead.
 */
@Injectable()
export class UssdSessionStore {
  constructor(private readonly db: DatabaseService) {}

  async find(providerSessionId: string): Promise<UssdSessionState | undefined> {
    const database = this.db.getDb();
    const row = await database.query.ussdSessions.findFirst({
      where: eq(ussdSessions.providerSessionId, providerSessionId),
    });
    if (!row || row.status !== 'active') {
      return undefined;
    }
    return { step: row.currentStep ?? '', data: row.state };
  }

  async create(
    providerSessionId: string,
    msisdn: string,
    flowId: string,
    state: UssdSessionState,
  ): Promise<void> {
    const database = this.db.getDb();
    await database.insert(ussdSessions).values({
      providerSessionId,
      flowId,
      msisdn,
      currentStep: state.step,
      state: state.data,
      status: 'active',
    });
  }

  async update(
    providerSessionId: string,
    state: UssdSessionState,
  ): Promise<void> {
    const database = this.db.getDb();
    await database
      .update(ussdSessions)
      .set({
        currentStep: state.step,
        state: state.data,
        updatedAt: new Date(),
      })
      .where(eq(ussdSessions.providerSessionId, providerSessionId));
  }

  async complete(
    providerSessionId: string,
    state: UssdSessionState,
  ): Promise<void> {
    const database = this.db.getDb();
    await database
      .update(ussdSessions)
      .set({
        currentStep: state.step,
        state: state.data,
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(ussdSessions.providerSessionId, providerSessionId));
  }

  async abandon(providerSessionId: string, atStep: string): Promise<void> {
    const database = this.db.getDb();
    await database
      .update(ussdSessions)
      .set({
        status: 'abandoned',
        abandonedAtStep: atStep,
        updatedAt: new Date(),
      })
      .where(eq(ussdSessions.providerSessionId, providerSessionId));
  }
}
