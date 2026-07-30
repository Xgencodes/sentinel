import { Injectable } from '@nestjs/common';
import { UssdFlow, UssdSessionState, UssdStepResult } from './flow.interface';
import { PatientsService } from '../../registry/patients/patients.service';
import { ZonesService } from '../../registry/zones/zones.service';

export const CONSENT_TEXT_VERSION = 'self-registration-v1';

const CONSENT_TEXT: Record<string, string> = {
  en: 'Sentinel will contact you by SMS/USSD about climate and health risks in your area, and may share your details with a health worker if needed. 1) Agree 2) Disagree',
  tw: 'Sentinel bɛfrɛ wo wɔ SMS/USSD so afa mframa ne akwahosan ho asiane a ɛwɔ wo mpɔtam ho, na ebia ɔde wo nsɛm bɛkɔ akwahosan adwumayɛni hɔ sɛ ɛho hia. 1) Mepene so 2) Mempene so',
  ee: 'Sentinel aɖo ka na wò to SMS/USSD dzi tso yame ƒe tɔtrɔ kple lãmesẽ ƒe afɔkuwo si le wò nutome ŋu, eye ate ŋu ana wò nyawo lãmesẽdɔwɔla ne ehiã. 1) Melɔ̃ 2) Nyemelɔ̃ o',
};

const COHORT_MENU: Record<string, string> = {
  en: 'Are you: 1) Pregnant 2) Caring for a child under 5 3) Living with a chronic condition 4) None of these',
  tw: 'Wo yɛ: 1) Onyinsɛn 2) Wohwɛ abofra a wadi mfe 5 anaa akyi 3) Wowɔ ɔyare a ɛkyɛ 4) Emu biara nni mu',
  ee: 'Wòe: 1) Fudoɖola 2) Kpɔa ɖevi si le ƒe 5 me alo eme tsɔ dzi 3) Le dɔléle didi aɖe me 4) Wo dometɔ aɖeke menye o',
};

const LANGUAGE_BY_CHOICE: Record<string, string> = {
  '1': 'en',
  '2': 'tw',
  '3': 'ee',
};

/**
 * Patient self-registration via USSD (requirement 4): a caller dials the
 * shortcode with no prior account and, at the end of this flow, exists in
 * the registry with a language, a zone, a cohort, and a logged consent
 * record — identity is the phone number itself (decision 15).
 */
@Injectable()
export class PatientSelfRegistrationFlow implements UssdFlow {
  readonly flowId = 'patient-self-register';

  constructor(
    private readonly patientsService: PatientsService,
    private readonly zonesService: ZonesService,
  ) {}

  start(_msisdn: string): Promise<UssdStepResult> {
    return Promise.resolve({
      text: 'CON Welcome to Sentinel. Choose your language:\n1) English\n2) Twi\n3) Ewe',
      continueSession: true,
      state: { step: 'language', data: {} },
    });
  }

  async handle(
    msisdn: string,
    state: UssdSessionState,
    input: string,
  ): Promise<UssdStepResult> {
    switch (state.step) {
      case 'language':
        return this.handleLanguage(input, state);
      case 'consent':
        return this.handleConsent(msisdn, input, state);
      case 'zone':
        return this.handleZone(input, state);
      case 'cohort':
        return this.handleCohort(msisdn, input, state);
      default:
        return {
          text: 'END Something went wrong. Please dial in again.',
          continueSession: false,
          state,
        };
    }
  }

  private handleLanguage(
    input: string,
    state: UssdSessionState,
  ): UssdStepResult {
    const language = LANGUAGE_BY_CHOICE[input.trim()];
    if (!language) {
      return {
        text: 'CON Please choose 1, 2 or 3:\n1) English\n2) Twi\n3) Ewe',
        continueSession: true,
        state,
      };
    }

    return {
      text: `CON ${CONSENT_TEXT[language]}`,
      continueSession: true,
      state: { step: 'consent', data: { ...state.data, language } },
    };
  }

  private async handleConsent(
    _msisdn: string,
    input: string,
    state: UssdSessionState,
  ): Promise<UssdStepResult> {
    const choice = input.trim();
    const language = state.data.language as string;

    if (choice === '2') {
      // No patient row exists at this point, and none is created for a
      // decline — nothing is persisted about a phone number that never
      // registered.
      return {
        text: 'END You have not been registered. Dial in again any time.',
        continueSession: false,
        state: {
          step: 'declined',
          data: { ...state.data, consentGranted: false },
        },
      };
    }
    if (choice !== '1') {
      return {
        text: `CON ${CONSENT_TEXT[language]}`,
        continueSession: true,
        state,
      };
    }

    const zones = await this.zonesService.findAll();
    const zoneMenu = zones.map((z, i) => `${i + 1}) ${z.name}`).join('\n');

    return {
      text: `CON Select your area:\n${zoneMenu}`,
      continueSession: true,
      state: {
        step: 'zone',
        data: {
          ...state.data,
          consentGranted: true,
          zoneOptions: zones.map((z) => z.id),
        },
      },
    };
  }

  private handleZone(input: string, state: UssdSessionState): UssdStepResult {
    const zoneOptions = state.data.zoneOptions as string[];
    const index = Number(input.trim()) - 1;
    const zoneId = zoneOptions[index];
    const language = state.data.language as string;

    if (!zoneId) {
      return {
        text: 'CON Invalid choice. Please select your area again.',
        continueSession: true,
        state,
      };
    }

    return {
      text: `CON ${COHORT_MENU[language]}`,
      continueSession: true,
      state: { step: 'cohort', data: { ...state.data, zoneId } },
    };
  }

  private async handleCohort(
    msisdn: string,
    input: string,
    state: UssdSessionState,
  ): Promise<UssdStepResult> {
    const choice = input.trim();
    const cohortFlags = {
      isAntenatal: choice === '1',
      isUnderFiveHousehold: choice === '2',
      hasChronicCondition: choice === '3',
    };

    if (!['1', '2', '3', '4'].includes(choice)) {
      const language = state.data.language as string;
      return {
        text: `CON ${COHORT_MENU[language]}`,
        continueSession: true,
        state,
      };
    }

    const language = state.data.language as string;
    const patient = await this.patientsService.create({
      msisdn,
      zoneId: state.data.zoneId as string,
      language,
      registrationProvenance: 'self-ussd',
      ...cohortFlags,
    });

    // Consent was captured before the patient existed, so it's persisted
    // now against the row it belongs to. A decline never reaches this
    // point — no patient row, and nothing is persisted about a phone
    // number that never registered.
    await this.patientsService.recordConsent({
      patientId: patient.id,
      channel: 'ussd',
      consentTextVersion: CONSENT_TEXT_VERSION,
      consentText: CONSENT_TEXT[language],
      granted: true,
    });

    return {
      text: 'END You are registered with Sentinel. Thank you.',
      continueSession: false,
      state: { step: 'complete', data: { ...state.data, ...cohortFlags } },
    };
  }
}
