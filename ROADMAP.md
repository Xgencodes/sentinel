# Roadmap

Sentinel closes the chain from a climate signal to a child receiving care:
climate signal → affected zone → at-risk patients → contact → triage →
escalation → placement → record transfer → outcome data. This roadmap
separates what runs today from what the funded work builds.

## Live today

- **Registry** (link 0): facilities with beds/specialties, providers, CHWs,
  patients (MSISDN identity), consent records preserving exact wording shown.
- **Cohort resolution** (link 3): zone → contactable ANC / under-five /
  chronic-condition patient lists with CHW assignment.
- **Facility routing under constraint** (link 7): bed availability × specialty
  match × road accessibility, degrading predictably as each is removed.
- **Climate signal ingestion** (link 1): pluggable adapters (rainfall,
  standing water, DHIS2 surveillance, clinical signal via ehr-bridge), all
  with synthetic fallbacks so the system runs with zero external
  dependencies. Scheduled daily, with a manual trigger for testing.
- **Feature normalisation**: facility × zone × epi-week table with rainfall
  lags, standing-water days, and rolling case-count averages.
- **Baseline trigger model** (link 2): sensitivity-first threshold model
  producing a zone-level trigger and a facility-level risk score. Explicitly
  a trigger, not a forecaster — see MODEL_CARD.md.
- **Community reports**: USSD/hotline-sourced signal (flooding, standing
  water, impassable roads, illness clusters), with CHW verification before
  anything acts on it.
- **Telemetry**: every KPI-bearing event (contact, triage, escalation,
  placement, record transfer) threaded through one correlationId per patient
  journey — see `@ehr-bridge/sdk`'s telemetry module.

## In progress / funded

- **Model layer** (links 5–6): climate-context-aware assessment, escalation
  policy with a hard safety floor for pregnancy danger signs, eval harness.
- **Delivery layer** (links 4, 6): Africa's Talking SMS/USSD channel, outbound
  dispatch, inbound registration and CHW flows, multilingual templates
  (English, Twi, Ewe).
- **sentinel-stack**: the composed single-server reference deployment and
  full nine-link demo scenario.
- Ensemble risk models, retrospective cholera validation, 14-day horizon
  calibration, Ghana Met production data agreement — all explicitly deferred
  to the grant period, not shipped today.
- Real DHIS2 org-unit mapping per zone (the adapter is real; production zone
  mappings are a deployment-time configuration task).
- Voice channel: out of scope for this release. SMS and USSD only.

## Explicitly out of scope

Sentinel does not duplicate ehr-bridge's interoperability role, and
ehr-bridge does not become a system of record — see each repo's SECURITY.md
for why the PHI boundary is drawn where it is.
