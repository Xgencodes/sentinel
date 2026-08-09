import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RegistryModule } from '../registry/registry.module';
import { SMS_ADAPTER } from './dispatch/delivery.tokens';
import { SmsAdapter } from './channels/sms-adapter.interface';
import { MockSmsAdapter } from './channels/mock-sms.adapter';
import { AfricasTalkingAdapter } from './channels/africas-talking.adapter';
import { OutboundDispatcherService } from './dispatch/outbound-dispatcher.service';
import { PatientSelfRegistrationFlow } from './ussd/patient-self-registration.flow';
import { ChwVisitListFlow } from './ussd/chw-visit-list.flow';
import { UssdFlowRouter } from './ussd/flow-router';
import { UssdSessionStore } from './ussd/ussd-session.store';
import { UssdController } from './ussd/ussd.controller';
import { CampaignsController } from './dispatch/campaigns.controller';
import { ProviderContactController } from './dispatch/provider-contact.controller';

/**
 * Delivery — links 4 and 6's contact channel. Exported for composition
 * alongside registry, signals and model. Imports RegistryModule directly
 * since the USSD flows read and write patients/CHWs.
 */
@Module({
  imports: [DatabaseModule, RegistryModule],
  controllers: [UssdController, CampaignsController, ProviderContactController],
  providers: [
    {
      // Never the default: a stranger's clean clone has no AT credentials,
      // so this only activates when AT_API_KEY is actually configured
      // (Q30). See channels/mock-sms.adapter.ts and africas-talking.adapter.ts.
      provide: SMS_ADAPTER,
      useFactory: (): SmsAdapter => {
        const apiKey = process.env.AT_API_KEY;
        if (apiKey) {
          return new AfricasTalkingAdapter({
            apiKey,
            username: process.env.AT_USERNAME ?? 'sandbox',
            senderId: process.env.AT_SENDER_ID,
            baseUrl: process.env.AT_BASE_URL,
          });
        }
        return new MockSmsAdapter();
      },
    },
    OutboundDispatcherService,
    PatientSelfRegistrationFlow,
    ChwVisitListFlow,
    UssdFlowRouter,
    UssdSessionStore,
  ],
  exports: [SMS_ADAPTER, OutboundDispatcherService],
})
export class DeliveryModule {}
