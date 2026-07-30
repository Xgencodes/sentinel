import { Logger } from '@nestjs/common';
import {
  SignalRecord,
  SignalWindow,
  SourceAdapter,
} from './source-adapter.interface';
import { SyntheticClimateAdapter } from './synthetic-climate.adapter';

export interface DHIS2AdapterConfig {
  baseUrl: string;
  username: string;
  password: string;
  /** DHIS2 data element id to read, mapped to a zone via orgUnit. */
  dataElementId: string;
  /** zoneId -> DHIS2 organisation unit id. */
  orgUnitByZone: Record<string, string>;
}

/**
 * Read-only client against a DHIS2 analytics endpoint, defaulting to the
 * public demo instance (play.dhis2.org/demo). DHIS2 is the surveillance
 * standard across most programme countries, which is why it's a first-class
 * adapter rather than a bespoke integration.
 *
 * The demo instance is a shared public sandbox with no uptime guarantee.
 * Q30 requires a stranger's clone to work regardless, so every failure —
 * network error, auth failure, unmapped zone — falls back to synthetic data
 * rather than propagating.
 */
export class DHIS2Adapter implements SourceAdapter {
  readonly source = 'dhis2';
  private readonly logger = new Logger(DHIS2Adapter.name);

  constructor(
    private readonly config: DHIS2AdapterConfig,
    private readonly fallback: SyntheticClimateAdapter,
    private readonly httpGet: (
      url: string,
      auth: string,
    ) => Promise<{ ok: boolean; json(): Promise<any> }> = fetchJson,
  ) {}

  async fetch(zoneId: string, window: SignalWindow): Promise<SignalRecord[]> {
    const orgUnit = this.config.orgUnitByZone[zoneId];
    if (!orgUnit) {
      this.logger.warn(
        `No DHIS2 org unit mapped for zone ${zoneId}; falling back to synthetic data`,
      );
      return this.fallback.fetch(zoneId, window);
    }

    try {
      const url = this.buildUrl(orgUnit, window);
      const auth = Buffer.from(
        `${this.config.username}:${this.config.password}`,
      ).toString('base64');
      const response = await this.httpGet(url, auth);

      if (!response.ok) {
        throw new Error(`DHIS2 responded with a non-OK status`);
      }

      const body = await response.json();
      return this.parse(zoneId, body);
    } catch (error) {
      this.logger.warn(
        `DHIS2 fetch failed for zone ${zoneId}, falling back to synthetic data: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.fallback.fetch(zoneId, window);
    }
  }

  private buildUrl(orgUnit: string, window: SignalWindow): string {
    const from = window.from.toISOString().slice(0, 10);
    const to = window.to.toISOString().slice(0, 10);
    return (
      `${this.config.baseUrl}/api/analytics.json` +
      `?dimension=dx:${this.config.dataElementId}` +
      `&dimension=ou:${orgUnit}` +
      `&startDate=${from}&endDate=${to}`
    );
  }

  private parse(zoneId: string, body: any): SignalRecord[] {
    const rows: any[] = body?.rows ?? [];
    return rows.map((row) => ({
      zoneId,
      source: this.source,
      metric: 'case_count' as const,
      value: Number(row[row.length - 1]) || 0,
      timestamp: new Date(),
    }));
  }
}

async function fetchJson(url: string, auth: string) {
  return fetch(url, { headers: { Authorization: `Basic ${auth}` } });
}

export const DHIS2_DEMO_CONFIG: Omit<DHIS2AdapterConfig, 'orgUnitByZone'> = {
  baseUrl: 'https://play.dhis2.org/demo',
  username: 'admin',
  password: 'district',
  dataElementId: 'fbfJHSPpUQD', // ANC 1st visit — a stand-in demo data element
};
