# Model Card — Sentinel Assessment Layer

## Intended use

Triage and escalation *support* for community health workers and caregivers
during climate-driven health events. It is not a diagnostic tool and does not
replace clinical judgement.

## Architecture

Climate conditions enter clinical reasoning as **structured context injected
at inference time** (`src/model/reasoning/climate-context.ts`), not as
fine-tuned weights. A reported fever in a flood-affected zone during the
post-flood malaria window is weighted differently than the same fever in a
dry month — see `escalationSensitivityBoost` for exactly how, and
`escalation-policy.spec.ts` for the test asserting identical symptom text
produces different escalation depending on zone conditions.

**Weights status: TBD, pluggable.** No fine-tuning happens in this repo or as
part of the running service. `InferenceBackend` is model-agnostic:

- `MockInferenceBackend` — deterministic, keyword-matched, zero weights.
  Default in tests and CI.
- `HttpModelBackend` — calls an external model over HTTP. The reference
  deployment points this at an existing openly-licensed model, so the system
  runs end to end under an OSI licence with zero training and zero
  proprietary dependency.
- A hosted, already-trained model (e.g. AIDA) can be wired in via the same
  interface, by configuration only.

## Safety design

**The pregnancy danger-sign floor is not a model behaviour — it's a rule.**
`EscalationPolicy` checks `mentionsPregnancyDangerSign()` independently of
whatever severity the backend assigns, and escalates unconditionally when it
fires for an antenatal-cohort patient. This is deliberate: the KPI commitment
is zero unescalated safety-critical pregnancy cases, and that cannot depend on
a model getting it right. See `escalation-policy.spec.ts`, which asserts the
floor overrides every severity level, and `eval/harness.ts`, whose pregnancy
safety canary set must escalate 100% of the time — a single miss fails the
suite.

## Limitations

- The keyword-based danger-sign detector is a stand-in for real clinical NLU.
  It has known false-negative risk for phrasings not in its pattern list —
  the eval harness exists specifically to surface these before they reach a
  real deployment (see the two bugs it caught during development: "not
  moved" vs. "not moving", and "swelling of my face" vs. "swelling of face").
- The mock backend's severity classification is illustrative, not clinically
  validated.
- Climate context today comes from a single zone-level trigger; it does not
  yet vary by facility or by finer-grained location within a zone.

## Bias surface

- Training data provenance for any real backend is not yet determined
  (weights are TBD).
- Danger-sign phrasing is currently English-pattern-based; equivalent
  phrasings in Twi/Ewe are not yet covered by the same rigor and should be
  audited before any production language rollout.

## Honest limits (see project ROADMAP.md)

Whether patients accept and act on guidance delivered this way during an
emergency is genuinely unproven. Total cellular outage defeats the channel
entirely. Disease-incidence attribution isn't achievable at this scale.
