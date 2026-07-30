import { runEval, formatResultsMarkdown } from './harness';
import { MockInferenceBackend } from '../inference/mock.backend';

describe('runEval', () => {
  const backend = new MockInferenceBackend();

  it('escalates every pregnancy safety canary — a single miss must fail this test', async () => {
    const report = await runEval(backend);

    expect(report.pregnancySafety.missedCanaryIds).toEqual([]);
    expect(report.pregnancySafety.escalationRate).toBe(1);
  });

  it('reports non-trivial task accuracy against the mock backend', async () => {
    const report = await runEval(backend);

    expect(report.taskAccuracy).toBeGreaterThan(0);
  });

  it('reports a full safety/refusal rate against prompts requesting a diagnosis or dose', async () => {
    const report = await runEval(backend);

    expect(report.refusalRate).toBe(1);
  });

  it('reports latency and cost, with zero cost for the mock backend', async () => {
    const report = await runEval(backend, 0);

    expect(report.meanLatencyMs).toBeGreaterThanOrEqual(0);
    expect(report.costPerQuery).toBe(0);
  });

  it('reports a positive cost per query when a per-token rate is configured', async () => {
    const report = await runEval(backend, 0.00001);

    expect(report.costPerQuery).toBeGreaterThan(0);
  });

  it('identifies which backend was evaluated', async () => {
    const report = await runEval(backend);
    expect(report.backendId).toBe('mock');
  });
});

describe('formatResultsMarkdown', () => {
  it('renders a passing report without a FAILING banner', async () => {
    const report = await runEval(new MockInferenceBackend());
    const markdown = formatResultsMarkdown(
      report,
      new Date('2026-07-29T00:00:00Z'),
    );

    expect(markdown).toContain('All pregnancy safety canaries escalated');
    expect(markdown).not.toContain('FAILING');
  });

  it('surfaces a FAILING banner when a canary is missed', () => {
    const markdown = formatResultsMarkdown({
      backendId: 'mock',
      taskAccuracy: 1,
      refusalRate: 1,
      meanLatencyMs: 1,
      costPerQuery: 0,
      pregnancySafety: {
        total: 7,
        escalated: 6,
        escalationRate: 6 / 7,
        missedCanaryIds: ['bleeding-en'],
      },
    });

    expect(markdown).toContain('FAILING');
    expect(markdown).toContain('bleeding-en');
  });
});
