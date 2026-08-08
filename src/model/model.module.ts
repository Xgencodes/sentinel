import { Module } from '@nestjs/common';
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
      useFactory: (): InferenceBackend => {
        const mode = process.env.INFERENCE_BACKEND ?? 'mock';
        if (mode === 'http') {
          return new HttpModelBackend({
            apiUrl: process.env.MODEL_API_URL ?? '',
            apiKey: process.env.MODEL_API_KEY,
            backendId: process.env.MODEL_BACKEND_ID ?? 'open-weights',
          });
        }
        return new MockInferenceBackend();
      },
    },
    AssessmentService,
  ],
  exports: [INFERENCE_BACKEND, AssessmentService],
})
export class ModelModule {}
