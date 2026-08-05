# Security Policy

## Supported versions

Pre-1.0. Only `main` receives security fixes.

## Reporting a vulnerability

**Do not open a public issue for security problems.** Email
**John@drdogood.health** with what the issue is, how to reproduce it, and
what an attacker could achieve. Expect acknowledgement within 3 working days.

## Where PHI-equivalent data lives — and where it doesn't

This is the one repo in the Sentinel stack that holds real identifying
data by design: patient names, phone numbers, locations, and cohort
membership live in the `sentinel_registry` Postgres schema
(`src/registry/schema.ts`). Every other schema (`sentinel_core`) and every
other repo in this stack (`ehr-bridge`) is deliberately kept free of that
data — see `ehr-bridge/SECURITY.md` for why.

Consequences of that design:

- **Consent is a row, not a flag.** `consent_records` stores the exact
  wording a person was shown, not just a boolean — see
  `src/registry/patients/patients.service.ts`.
- **Deployments handling real patients need real data protection**:
  encryption at rest for the `sentinel_registry` schema specifically,
  access logging, and a retention policy. None of that is implemented in
  this reference codebase — it ships with development defaults suitable
  for a demo, not a production PHI store.
- **No real patient data in this repository, including history.** All
  fixtures and the demo scenario use synthetic data only.

## Safety-critical code

The pregnancy-safety escalation floor (`src/model/reasoning/escalation-policy.ts`,
`src/model/reasoning/danger-signs.ts`) is treated as security-relevant, not
just correctness-relevant — a regression there is a patient-safety issue.
Report suspected regressions the same way as a security vulnerability.

## Deployment defaults that must change

| Variable | Why it matters |
|---|---|
| `ADMIN_API_KEY`, `ADMIN_SECRET_ENCRYPTION_KEY` | ehr-bridge admin auth and secret encryption — see its own SECURITY.md |
| `AT_API_KEY` | Real SMS credentials, if configured — treat like any other secret |

Generate secrets with `openssl rand -hex 32`.
