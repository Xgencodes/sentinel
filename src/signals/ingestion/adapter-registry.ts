import { Injectable } from '@nestjs/common';
import { SourceAdapter } from './source-adapter.interface';

/**
 * Registry of ingestion adapters, mirroring the pattern in ehr-bridge's
 * mapper.registry.ts: register an adapter for a source name, look it up
 * generically. New feeds plug in without touching the ingestion scheduler.
 */
@Injectable()
export class AdapterRegistry {
  private readonly adapters = new Map<string, SourceAdapter>();

  register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.source, adapter);
  }

  get(source: string): SourceAdapter | undefined {
    return this.adapters.get(source);
  }

  getAll(): SourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  getRegisteredSources(): string[] {
    return Array.from(this.adapters.keys());
  }
}
