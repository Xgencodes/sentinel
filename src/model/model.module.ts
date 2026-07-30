import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { INFERENCE_BACKEND } from './reasoning/inference.tokens';
import { InferenceBackend } from './inference/backend.interface';
import { MockInferenceBackend } from './inference/mock.backend';
import { HttpModelBackend } from './inference/http-model.backend';
import { AssessmentService } from './reasoning/assessment.service';
import { AssessmentController } from './api/assessment.controller';
import { EvalController } from './api/eval.controller';

/**
 * The reasoning layer — links 5 and 6. Exported for composition alongside
 * the registry, signals and delivery modules.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [AssessmentController, EvalController],
  providers: [
    {
      provide: INFERENCE_BACKEND,
      useFactory: (config: ConfigService): InferenceBackend => {
        const mode = config.get<string>('INFERENCE_BACKEND', 'mock');
        if (mode === 'http') {
          return new HttpModelBackend({
            apiUrl: config.get<string>('MODEL_API_URL', ''),
            apiKey: config.get<string>('MODEL_API_KEY'),
            backendId: config.get<string>('MODEL_BACKEND_ID', 'open-weights'),
          });
        }
        return new MockInferenceBackend();
      },
      inject: [ConfigService],
    },
    AssessmentService,
  ],
  exports: [INFERENCE_BACKEND, AssessmentService],
})
export class ModelModule {}
