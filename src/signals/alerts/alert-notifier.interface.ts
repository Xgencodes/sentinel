export interface AlertPayload {
  zoneId?: string;
  facilityId?: string;
  band: string;
  message: string;
}

export interface AlertNotifier {
  notify(alert: AlertPayload): Promise<void>;
}

/** Structured JSON to stdout — the default, requiring no infrastructure. */
export class LogAlertNotifier implements AlertNotifier {
  notify(alert: AlertPayload): Promise<void> {
    console.log(JSON.stringify({ type: 'sentinel.alert', ...alert }));
    return Promise.resolve();
  }
}
