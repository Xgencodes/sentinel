/**
 * Whether the road between an origin zone and a candidate facility is
 * currently passable. A real implementation would consult a road-condition
 * or flood-extent feed; the synthetic default assumes every road is open,
 * which keeps routing usable before that data source exists.
 */
export interface RoadAccessAdapter {
  isAccessible(originZoneId: string, facilityId: string): Promise<boolean>;
}

export class SyntheticRoadAccessAdapter implements RoadAccessAdapter {
  constructor(
    /** zoneId -> Set of facilityIds known to be cut off, for tests/demos. */
    private readonly blockedRoutes: Map<string, Set<string>> = new Map(),
  ) {}

  isAccessible(originZoneId: string, facilityId: string): Promise<boolean> {
    const blocked = this.blockedRoutes.get(originZoneId);
    return Promise.resolve(!blocked?.has(facilityId));
  }

  block(originZoneId: string, facilityId: string): void {
    const blocked = this.blockedRoutes.get(originZoneId) ?? new Set();
    blocked.add(facilityId);
    this.blockedRoutes.set(originZoneId, blocked);
  }
}
