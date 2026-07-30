import { Injectable } from '@nestjs/common';
import { RiskModel } from './risk-model.interface';
import { BaselineTriggerModel } from './baseline-trigger.model';

/**
 * Swap in an ensemble model later without touching the zone-trigger service
 * or the API layer — same pattern as ehr-bridge's mapper registry.
 */
@Injectable()
export class ModelRegistry {
  private active: RiskModel = new BaselineTriggerModel();

  get(): RiskModel {
    return this.active;
  }

  use(model: RiskModel): void {
    this.active = model;
  }
}
