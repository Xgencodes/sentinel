import {
  pgSchema,
  text,
  uuid,
  boolean,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { zones, facilities, patients, providers } from '../registry/schema';

/**
 * Signals, model outputs, and delivery state — links 1, 2, 4, 5, 6, 9.
 *
 * No PHI lives here. Rows reference registry ids (patientId, chwId, zoneId)
 * but never duplicate names, phone numbers, or free text. See
 * src/registry/schema.ts for where identifying data actually lives.
 */
export const core = pgSchema('sentinel_core');

// ---------------------------------------------------------------------------
// Climate signals (link 1)
// ---------------------------------------------------------------------------

export const climateSignals = core.table('climate_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  zoneId: uuid('zone_id')
    .references(() => zones.id)
    .notNull(),
  source: text('source').notNull(), // synthetic | open-meteo | chirps | era5 | ghana-met | dhis2 | ehr-bridge | community-report
  metric: text('metric').notNull(), // rainfall_mm | soil_moisture | river_discharge | case_count | community_report
  value: doublePrecision('value').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Feature table snapshots (facility x zone x epi-week) — C14
// ---------------------------------------------------------------------------

export const featureRows = core.table('feature_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  zoneId: uuid('zone_id')
    .references(() => zones.id)
    .notNull(),
  facilityId: uuid('facility_id').references(() => facilities.id),
  epiWeek: text('epi_week').notNull(), // ISO week, e.g. '2026-W30'
  rainfallMm: doublePrecision('rainfall_mm'),
  rainfallMmLag1: doublePrecision('rainfall_mm_lag1'),
  rainfallMmLag2: doublePrecision('rainfall_mm_lag2'),
  standingWaterDays: doublePrecision('standing_water_days'),
  caseCount: integer('case_count'),
  caseCountLag1: integer('case_count_lag1'),
  caseCountRolling4wkAvg: doublePrecision('case_count_rolling_4wk_avg'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Zone triggers and facility risk scores (link 2) — C15/C16
// ---------------------------------------------------------------------------

export const zoneTriggers = core.table('zone_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  zoneId: uuid('zone_id')
    .references(() => zones.id)
    .notNull(),
  epiWeek: text('epi_week').notNull(),
  triggered: boolean('triggered').notNull(),
  band: text('band').notNull(), // low | medium | high
  sensitivity: doublePrecision('sensitivity').notNull(),
  modelVersion: text('model_version').notNull(),
  explanation: text('explanation'),
  // Structured breakdown of what fed the band (rainfall/standing water/case
  // spike/community reports) — see TriggerFactors. Kept alongside the prose
  // `explanation` rather than replacing it: this is what the dashboard's
  // "why" checklist renders from.
  factors: jsonb('factors').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const facilityRiskScores = core.table('facility_risk_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  facilityId: uuid('facility_id')
    .references(() => facilities.id)
    .notNull(),
  epiWeek: text('epi_week').notNull(),
  band: text('band').notNull(),
  modelVersion: text('model_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Community-sourced signal (decision 21) — C18
// ---------------------------------------------------------------------------

export const communityReports = core.table('community_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  zoneId: uuid('zone_id')
    .references(() => zones.id)
    .notNull(),
  reporterMsisdn: text('reporter_msisdn'), // null for anonymous hotline entries
  reportType: text('report_type').notNull(), // flooding | standing_water | impassable_road | contaminated_water | illness_cluster
  severity: text('severity'),
  freeText: text('free_text'),
  intakeChannel: text('intake_channel').notNull(), // ussd | hotline-admin
  verificationStatus: text('verification_status')
    .notNull()
    .default('unverified'), // unverified | chw-confirmed | dismissed
  verifiedByChwId: uuid('verified_by_chw_id').references(() => providers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Alerts (C16 emission)
// ---------------------------------------------------------------------------

export const alerts = core.table('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  zoneId: uuid('zone_id').references(() => zones.id),
  facilityId: uuid('facility_id').references(() => facilities.id),
  band: text('band').notNull(),
  message: text('message').notNull(),
  // Lifecycle: an alert is a standing risk episode for its zone, not a
  // one-shot log line — ZoneTriggerService.evaluateZone reuses the existing
  // 'open' alert for a zone (updating band/message) rather than inserting
  // a duplicate on every re-evaluation, auto-resolves it when the zone
  // drops back to LOW, and a human can dismiss one early as a false
  // positive via PATCH /v1/alerts/:id/dismiss.
  status: text('status').notNull().default('open'), // open | resolved | dismissed
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedReason: text('resolved_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Campaigns and messages (links 4, delivery) — C41
// ---------------------------------------------------------------------------

export const campaigns = core.table('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  zoneId: uuid('zone_id')
    .references(() => zones.id)
    .notNull(),
  triggerZoneTriggerId: uuid('trigger_zone_trigger_id').references(
    () => zoneTriggers.id,
  ),
  cohortSize: integer('cohort_size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const messages = core.table('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').references(() => campaigns.id),
  patientId: uuid('patient_id').references(() => patients.id),
  chwId: uuid('chw_id').references(() => providers.id),
  channel: text('channel').notNull(), // sms | ussd
  language: text('language').notNull(),
  templateId: text('template_id').notNull(),
  status: text('status').notNull().default('pending'), // pending | sent | delivered | failed
  failureReason: text('failure_reason'),
  providerMessageId: text('provider_message_id'), // Africa's Talking message id
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// USSD sessions (delivery, inbound + outbound) — C40/C42
// ---------------------------------------------------------------------------

export const ussdSessions = core.table('ussd_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerSessionId: text('provider_session_id').notNull(),
  flowId: text('flow_id').notNull(),
  msisdn: text('msisdn').notNull(),
  currentStep: text('current_step'),
  state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('active'), // active | completed | abandoned
  abandonedAtStep: text('abandoned_at_step'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Assessments and escalations (links 5, 6) — C31/C32
// ---------------------------------------------------------------------------

export const assessments = core.table('assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id')
    .references(() => patients.id)
    .notNull(),
  correlationId: text('correlation_id').notNull(),
  backendId: text('backend_id').notNull(),
  severitySignal: text('severity_signal').notNull(),
  guidance: text('guidance').notNull(),
  rationale: text('rationale'),
  confidence: doublePrecision('confidence'),
  climateContextApplied: boolean('climate_context_applied').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const escalations = core.table('escalations', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').references(() => assessments.id),
  patientId: uuid('patient_id')
    .references(() => patients.id)
    .notNull(),
  correlationId: text('correlation_id').notNull(),
  action: text('action').notNull(), // escalate | guidance | followUp
  forcedBySafetyRule: text('forced_by_safety_rule'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Placements (link 7) — C22
// ---------------------------------------------------------------------------

export const placements = core.table('placements', {
  id: uuid('id').primaryKey().defaultRandom(),
  escalationId: uuid('escalation_id').references(() => escalations.id),
  patientId: uuid('patient_id')
    .references(() => patients.id)
    .notNull(),
  facilityId: uuid('facility_id')
    .references(() => facilities.id)
    .notNull(),
  correlationId: text('correlation_id').notNull(),
  bedConfirmed: boolean('bed_confirmed').notNull(),
  specialtyMatched: boolean('specialty_matched').notNull(),
  roadAccessible: boolean('road_accessible').notNull(),
  // True once a human has picked a different destination than
  // FacilityRouterService.selectReceiving() originally chose — see
  // overrideDestination. facilityId above is always the current/real
  // destination either way; this just flags that it was overridden.
  overridden: boolean('overridden').notNull().default(false),
  recordTransferredAt: timestamp('record_transferred_at', {
    withTimezone: true,
  }),
  // Every placement starts 'ongoing' the moment it's created — treatment
  // status doesn't wait for the Monitoring stage to run before existing.
  outcomeStatus: text('outcome_status').notNull().default('ongoing'), // ongoing | recovered | referred
  outcomeUpdatedAt: timestamp('outcome_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const climateSignalsRelations = relations(climateSignals, ({ one }) => ({
  zone: one(zones, { fields: [climateSignals.zoneId], references: [zones.id] }),
}));

export const zoneTriggersRelations = relations(zoneTriggers, ({ one }) => ({
  zone: one(zones, { fields: [zoneTriggers.zoneId], references: [zones.id] }),
}));

export const facilityRiskScoresRelations = relations(
  facilityRiskScores,
  ({ one }) => ({
    facility: one(facilities, {
      fields: [facilityRiskScores.facilityId],
      references: [facilities.id],
    }),
  }),
);

export const communityReportsRelations = relations(
  communityReports,
  ({ one }) => ({
    zone: one(zones, {
      fields: [communityReports.zoneId],
      references: [zones.id],
    }),
    verifiedBy: one(providers, {
      fields: [communityReports.verifiedByChwId],
      references: [providers.id],
    }),
  }),
);

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  zone: one(zones, { fields: [campaigns.zoneId], references: [zones.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [messages.campaignId],
    references: [campaigns.id],
  }),
  patient: one(patients, {
    fields: [messages.patientId],
    references: [patients.id],
  }),
  chw: one(providers, { fields: [messages.chwId], references: [providers.id] }),
}));

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  patient: one(patients, {
    fields: [assessments.patientId],
    references: [patients.id],
  }),
  escalations: many(escalations),
}));

export const escalationsRelations = relations(escalations, ({ one, many }) => ({
  assessment: one(assessments, {
    fields: [escalations.assessmentId],
    references: [assessments.id],
  }),
  patient: one(patients, {
    fields: [escalations.patientId],
    references: [patients.id],
  }),
  placements: many(placements),
}));

export const placementsRelations = relations(placements, ({ one }) => ({
  escalation: one(escalations, {
    fields: [placements.escalationId],
    references: [escalations.id],
  }),
  patient: one(patients, {
    fields: [placements.patientId],
    references: [patients.id],
  }),
  facility: one(facilities, {
    fields: [placements.facilityId],
    references: [facilities.id],
  }),
}));
