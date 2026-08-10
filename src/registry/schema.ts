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

/**
 * The population and network registry — link 0 of the Sentinel chain.
 *
 * This is deliberately the **only** schema in the stack that holds real
 * identifying data (names, phone numbers, locations). ehr-bridge stays a
 * pointer/index system; the signals, model and delivery layers reference
 * registry ids but never duplicate the underlying data. Keeping PHI in one
 * namespace makes the boundary auditable. See SECURITY.md.
 */
export const registry = pgSchema('sentinel_registry');

// ---------------------------------------------------------------------------
// Zones — the catchment areas everything else is keyed by
// ---------------------------------------------------------------------------

export const zones = registry.table('zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Centroid, required so climate adapters can query a point. A future
  // iteration may store a full polygon instead.
  centroidLat: doublePrecision('centroid_lat').notNull(),
  centroidLng: doublePrecision('centroid_lng').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Facilities and the specialties/beds routing depends on
// ---------------------------------------------------------------------------

export const facilities = registry.table('facilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  zoneId: uuid('zone_id')
    .references(() => zones.id)
    .notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  bedsTotal: integer('beds_total').notNull().default(0),
  bedsAvailable: integer('beds_available').notNull().default(0),
  contactPhone: text('contact_phone'),
  // The ehr-bridge connection this facility receives FHIR transfers through,
  // if it has one. Null for facilities that are routing targets only.
  ehrBridgeConnectionId: text('ehr_bridge_connection_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const specialties = registry.table('specialties', {
  id: uuid('id').primaryKey().defaultRandom(),
  facilityId: uuid('facility_id')
    .references(() => facilities.id)
    .notNull(),
  code: text('code').notNull(), // e.g. 'obstetrics', 'pediatrics', 'general'
});

// A facility's own ehr-bridge EHR-system/partner identity, lazily
// provisioned on first transfer involving that facility (see
// WorkflowService.ensureFacilityIdentity in sentinel-stack). Split into its
// own table rather than columns on `facilities` because `facilities` is
// returned wholesale (no column allow-list) by GET /v1/registry/facilities,
// which the dashboard calls unauthenticated every 10s — a secret column
// there would leak through an endpoint that already exists. ehrSystemId and
// partnerKey are deterministic (derived from facilityId) and technically
// re-derivable; stored anyway so a lookup here is one query instead of a
// re-derivation plus a round trip to ehr-bridge's admin API every time.
export const facilityEhrIdentities = registry.table('facility_ehr_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  facilityId: uuid('facility_id')
    .references(() => facilities.id)
    .notNull()
    .unique(),
  ehrSystemId: text('ehr_system_id').notNull(),
  partnerKey: text('partner_key').notNull(),
  // AES-256-GCM via CryptoUtil — ehr-bridge only ever returns this secret
  // once (at partner-approval time), so it must be persisted in recoverable
  // form to sign future connection requests as this facility.
  partnerSecretEncrypted: text('partner_secret_encrypted').notNull(),
  provisionedAt: timestamp('provisioned_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Providers and CHWs — both are Practitioners, distinguished by role
// ---------------------------------------------------------------------------

export const providers = registry.table('providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  role: text('role').notNull(), // 'doctor' | 'chw'
  phone: text('phone').notNull(),
  facilityId: uuid('facility_id').references(() => facilities.id),
  // Only set when role = 'chw'
  catchmentZoneId: uuid('catchment_zone_id').references(() => zones.id),
  languages: jsonb('languages').$type<string[]>().notNull().default(['en']),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Patients — MSISDN is identity (decision 15)
// ---------------------------------------------------------------------------

export const patients = registry.table('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  msisdn: text('msisdn').notNull().unique(),
  name: text('name'),
  zoneId: uuid('zone_id').references(() => zones.id),
  language: text('language').notNull().default('en'),
  // Cohort flags. A patient may belong to more than one.
  isAntenatal: boolean('is_antenatal').notNull().default(false),
  isUnderFiveHousehold: boolean('is_under_five_household')
    .notNull()
    .default(false),
  hasChronicCondition: boolean('has_chronic_condition')
    .notNull()
    .default(false),
  assignedChwId: uuid('assigned_chw_id').references(() => providers.id),
  // Where this patient's record actually lives — the origin side of a
  // transfer (link 8). Nullable: a patient can exist (self-registered,
  // USSD, zone-only) before any facility relationship is known, same as
  // assignedChwId above. Required, not guessed, at transfer time if still
  // null — see WorkflowService.transferRecord.
  homeFacilityId: uuid('home_facility_id').references(() => facilities.id),
  registrationProvenance: text('registration_provenance').notNull(), // self-ussd | chw | dashboard
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Consent is its own row, not a boolean on patients, so the exact wording a
// person agreed to is preserved even if the flow's copy changes later.
export const consentRecords = registry.table('consent_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id')
    .references(() => patients.id)
    .notNull(),
  channel: text('channel').notNull(), // sms | ussd
  consentTextVersion: text('consent_text_version').notNull(),
  consentText: text('consent_text').notNull(),
  granted: boolean('granted').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const zonesRelations = relations(zones, ({ many }) => ({
  facilities: many(facilities),
  patients: many(patients),
  chws: many(providers),
}));

export const facilitiesRelations = relations(facilities, ({ one, many }) => ({
  zone: one(zones, { fields: [facilities.zoneId], references: [zones.id] }),
  specialties: many(specialties),
  providers: many(providers),
  ehrIdentity: one(facilityEhrIdentities, {
    fields: [facilities.id],
    references: [facilityEhrIdentities.facilityId],
  }),
}));

export const facilityEhrIdentitiesRelations = relations(
  facilityEhrIdentities,
  ({ one }) => ({
    facility: one(facilities, {
      fields: [facilityEhrIdentities.facilityId],
      references: [facilities.id],
    }),
  }),
);

export const specialtiesRelations = relations(specialties, ({ one }) => ({
  facility: one(facilities, {
    fields: [specialties.facilityId],
    references: [facilities.id],
  }),
}));

export const providersRelations = relations(providers, ({ one, many }) => ({
  facility: one(facilities, {
    fields: [providers.facilityId],
    references: [facilities.id],
  }),
  catchmentZone: one(zones, {
    fields: [providers.catchmentZoneId],
    references: [zones.id],
  }),
  assignedPatients: many(patients),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  zone: one(zones, { fields: [patients.zoneId], references: [zones.id] }),
  assignedChw: one(providers, {
    fields: [patients.assignedChwId],
    references: [providers.id],
  }),
  homeFacility: one(facilities, {
    fields: [patients.homeFacilityId],
    references: [facilities.id],
  }),
  consentRecords: many(consentRecords),
}));

export const consentRecordsRelations = relations(consentRecords, ({ one }) => ({
  patient: one(patients, {
    fields: [consentRecords.patientId],
    references: [patients.id],
  }),
}));
