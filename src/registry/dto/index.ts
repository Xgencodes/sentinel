import { z } from 'zod';

export const CreateZoneSchema = z.object({
  name: z.string().min(1),
  centroidLat: z.number().min(-90).max(90),
  centroidLng: z.number().min(-180).max(180),
});
export type CreateZoneRequest = z.infer<typeof CreateZoneSchema>;

export const CreateFacilitySchema = z.object({
  name: z.string().min(1),
  zoneId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  bedsTotal: z.number().int().min(0),
  bedsAvailable: z.number().int().min(0),
  contactPhone: z.string().optional(),
  specialties: z.array(z.string()).optional(),
});
export type CreateFacilityRequest = z.infer<typeof CreateFacilitySchema>;

export const UpdateBedsSchema = z.object({
  bedsAvailable: z.number().int().min(0),
});
export type UpdateBedsRequest = z.infer<typeof UpdateBedsSchema>;

export const CreateProviderSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['doctor', 'chw']),
  phone: z.string().min(3),
  facilityId: z.string().uuid().optional(),
  catchmentZoneId: z.string().uuid().optional(),
  languages: z.array(z.string()).optional(),
});
export type CreateProviderRequest = z.infer<typeof CreateProviderSchema>;

export const CreatePatientSchema = z.object({
  msisdn: z.string().min(6),
  name: z.string().optional(),
  zoneId: z.string().uuid().optional(),
  language: z.string().default('en'),
  isAntenatal: z.boolean().default(false),
  isUnderFiveHousehold: z.boolean().default(false),
  hasChronicCondition: z.boolean().default(false),
  assignedChwId: z.string().uuid().optional(),
  registrationProvenance: z.enum(['self-ussd', 'chw', 'dashboard']),
});
export type CreatePatientRequest = z.infer<typeof CreatePatientSchema>;

export const RecordConsentSchema = z.object({
  patientId: z.string().uuid(),
  channel: z.enum(['sms', 'ussd']),
  consentTextVersion: z.string(),
  consentText: z.string(),
  granted: z.boolean(),
});
export type RecordConsentRequest = z.infer<typeof RecordConsentSchema>;

export const ResolveCohortSchema = z.object({
  zoneId: z.string().uuid(),
  cohortTypes: z
    .array(z.enum(['antenatal-care', 'under-five', 'chronic-condition']))
    .min(1),
});
export type ResolveCohortRequest = z.infer<typeof ResolveCohortSchema>;

export const SelectFacilitySchema = z.object({
  patientId: z.string().uuid(),
  originZoneId: z.string().uuid(),
  requiredSpecialty: z.string().optional(),
});
export type SelectFacilityRequest = z.infer<typeof SelectFacilitySchema>;
