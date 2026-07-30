import { Controller, Get, Inject } from '@nestjs/common';
import { runEval } from '../eval/harness';
import { INFERENCE_BACKEND } from '../reasoning/inference.tokens';
import { InferenceBackend } from '../inference/backend.interface';

@Controller('v1/eval')
export class EvalController {
  constructor(
    @Inject(INFERENCE_BACKEND) private readonly backend: InferenceBackend,
  ) {}

  /** Runs the eval harness against whichever backend is currently configured. */
  @Get('run')
  async run() {
    return runEval(this.backend);
  }
}
