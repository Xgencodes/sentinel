import { Test, TestingModule } from '@nestjs/testing';
import { IngestionService } from './ingestion.service';
import { AdapterRegistry } from './adapter-registry';
import { FeatureTableService } from '../normalization/feature-table.service';
import { DatabaseService } from '../../database/database.service';
import { SourceAdapter } from './source-adapter.interface';

function fakeAdapter(
  source: string,
  recordsByZone: Record<string, number>,
): SourceAdapter {
  return {
    source,
    fetch: (zoneId) =>
      Promise.resolve(
        Array.from({ length: recordsByZone[zoneId] ?? 0 }, () => ({
          zoneId,
          source,
          metric: 'rainfall_mm' as const,
          value: 10,
          timestamp: new Date(),
        })),
      ),
  };
}

describe('IngestionService', () => {
  async function buildService(adapters: SourceAdapter[]) {
    const registry = new AdapterRegistry();
    adapters.forEach((a) => registry.register(a));

    const inserted: any[] = [];
    const dbStub = {
      getDb: () => ({
        insert: () => ({
          values: (v: any) => {
            inserted.push(v);
            return Promise.resolve([]);
          },
        }),
      }),
    };

    const featureTable = { rebuildForZone: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: AdapterRegistry, useValue: registry },
        { provide: DatabaseService, useValue: dbStub },
        { provide: FeatureTableService, useValue: featureTable },
      ],
    }).compile();

    return { service: module.get(IngestionService), featureTable, inserted };
  }

  const window = { from: new Date('2026-07-01'), to: new Date('2026-07-07') };

  it('rebuilds the feature table for every zone that received records', async () => {
    const { service, featureTable } = await buildService([
      fakeAdapter('rainfall', { 'zone-1': 3, 'zone-2': 2 }),
    ]);

    await service.run(['zone-1', 'zone-2'], window);

    expect(featureTable.rebuildForZone).toHaveBeenCalledWith('zone-1');
    expect(featureTable.rebuildForZone).toHaveBeenCalledWith('zone-2');
    expect(featureTable.rebuildForZone).toHaveBeenCalledTimes(2);
  });

  it('does not rebuild for a zone that received zero records from every adapter', async () => {
    const { service, featureTable } = await buildService([
      fakeAdapter('rainfall', { 'zone-1': 3, 'zone-2': 0 }),
    ]);

    await service.run(['zone-1', 'zone-2'], window);

    expect(featureTable.rebuildForZone).toHaveBeenCalledWith('zone-1');
    expect(featureTable.rebuildForZone).not.toHaveBeenCalledWith('zone-2');
  });

  it('rebuilds a zone only once even when multiple adapters write to it', async () => {
    const { service, featureTable } = await buildService([
      fakeAdapter('rainfall', { 'zone-1': 3 }),
      fakeAdapter('standing-water', { 'zone-1': 2 }),
    ]);

    await service.run(['zone-1'], window);

    expect(featureTable.rebuildForZone).toHaveBeenCalledTimes(1);
  });

  it('continues past one adapter failing and still rebuilds zones the other adapter touched', async () => {
    const failingAdapter: SourceAdapter = {
      source: 'broken',
      fetch: () => Promise.reject(new Error('feed down')),
    };
    const { service, featureTable, inserted } = await buildService([
      failingAdapter,
      fakeAdapter('rainfall', { 'zone-1': 1 }),
    ]);

    const results = await service.run(['zone-1'], window);

    expect(results.find((r) => r.source === 'rainfall')?.recordsWritten).toBe(
      1,
    );
    expect(results.find((r) => r.source === 'broken')).toBeUndefined();
    expect(featureTable.rebuildForZone).toHaveBeenCalledWith('zone-1');
    expect(inserted).toHaveLength(1);
  });

  it('continues past a feature-table rebuild failure for one zone without throwing', async () => {
    const { service, featureTable } = await buildService([
      fakeAdapter('rainfall', { 'zone-1': 1, 'zone-2': 1 }),
    ]);
    featureTable.rebuildForZone.mockImplementation((zoneId: string) =>
      zoneId === 'zone-1'
        ? Promise.reject(new Error('db error'))
        : Promise.resolve([]),
    );

    await expect(
      service.run(['zone-1', 'zone-2'], window),
    ).resolves.toBeDefined();
    expect(featureTable.rebuildForZone).toHaveBeenCalledWith('zone-2');
  });

  it('produces a default window covering roughly the trailing 21 days', async () => {
    const { service } = await buildService([]);

    const defaultWindow = service.defaultWindow();
    const spanDays =
      (defaultWindow.to.getTime() - defaultWindow.from.getTime()) /
      (24 * 60 * 60 * 1000);

    expect(spanDays).toBeCloseTo(21, 0);
  });
});
