import { Logger } from '@nestjs/common';
import {
  SignalRecord,
  SignalWindow,
  SourceAdapter,
} from './source-adapter.interface';

export interface ClinicalAdapterConfig {
  ehrBridgeBaseUrl: string;
  /** connectionId -> bearer token, one per facility connection in the zone. */
  connectionTokensByConnectionId: Record<string, string>;
  /** zoneId -> the connectionIds for facilities in that zone. */
  connectionIdsByZone: Record<string, string[]>;
}

/**
 * Clinical signal via EHR Bridge (link 1's clinical half): calls
 * GET /v1/signals/condition-counts for each facility connection in a zone
 * and sums the counts. This is the adapter A7 in ehr-bridge unblocks — it
 * has nothing to read until that endpoint and its clinicalEvents table
 * exist.
 */
export class EHRBridgeClinicalAdapter implements SourceAdapter {
  readonly source = 'ehr-bridge';
  private readonly logger = new Logger(EHRBridgeClinicalAdapter.name);

  constructor(
    private readonly config: ClinicalAdapterConfig,
    private readonly httpGet: (
      url: string,
      token: string,
    ) => Promise<{ ok: boolean; json(): Promise<any> }> = fetchJson,
  ) {}

  async fetch(zoneId: string, window: SignalWindow): Promise<SignalRecord[]> {
    const connectionIds = this.config.connectionIdsByZone[zoneId] ?? [];
    if (connectionIds.length === 0) {
      return [];
    }

    const records: SignalRecord[] = [];

    for (const connectionId of connectionIds) {
      const token = this.config.connectionTokensByConnectionId[connectionId];
      if (!token) {
        this.logger.warn(
          `No auth token configured for connection ${connectionId}`,
        );
        continue;
      }

      try {
        const url = this.buildUrl(window);
        const response = await this.httpGet(url, token);
        if (!response.ok) {
          throw new Error('non-OK response');
        }
        const body = await response.json();
        const counts: { count: number }[] = body?.data?.counts ?? [];
        const total = counts.reduce((sum, c) => sum + c.count, 0);

        records.push({
          zoneId,
          source: this.source,
          metric: 'case_count',
          value: total,
          timestamp: window.to,
        });
      } catch (error) {
        this.logger.warn(
          `Clinical signal fetch failed for connection ${connectionId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return records;
  }

  private buildUrl(window: SignalWindow): string {
    const from = window.from.toISOString().slice(0, 10);
    const to = window.to.toISOString().slice(0, 10);
    return `${this.config.ehrBridgeBaseUrl}/v1/signals/condition-counts?fromDate=${from}&toDate=${to}&window=week`;
  }
}

async function fetchJson(url: string, token: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}
