# Contributing

## Getting set up

```bash
git clone <org>/sentinel.git
cd sentinel
yarn install
yarn test
```

The test suite is fully offline — every service is exercised against a stub
database, no Postgres required to run `yarn test`.

To run the service itself you need Postgres:

```bash
createdb sentinel
DATABASE_URL=postgres://localhost:5432/sentinel yarn db:push
DATABASE_URL=postgres://localhost:5432/sentinel yarn start
```

## Commands

| Command | What it does |
|---|---|
| `yarn build` | Compile to `dist/` |
| `yarn test` | Run the Jest suite |
| `yarn test:cov` | Run with a coverage report |
| `yarn lint` | ESLint over `src/` |
| `yarn db:push` | Push the schema (both `sentinel_registry` and `sentinel_core`) to `DATABASE_URL` |

## Architecture

Four modules, each independently exported for composition (see
`src/index.ts`) and each also reachable standalone via this repo's own
`main.ts`:

- **registry** — the population/network registry (facilities, providers,
  CHWs, patients), cohort resolution, and facility routing under constraint.
  The only module that holds real identifying data — see its `SECURITY.md`
  note in `src/registry/schema.ts`.
- **signals** — climate ingestion adapters, normalisation into a feature
  table, and the baseline trigger model.
- **model** — climate-context-aware assessment and the escalation policy,
  including its hard pregnancy-safety floor.
- **delivery** — SMS/USSD dispatch and inbound flows (patient
  self-registration, CHW actions).

New ingestion adapters, cohort rules, or inference backends are added by
implementing the relevant interface and registering an instance — see
`ehr-bridge/docs/ADAPTERS.md` for the pattern this project follows
throughout.

## Pull requests

1. Branch from `main`.
2. Add tests for new logic — this codebase treats the test suite as where
   correctness claims get checked, not documentation.
3. Run `yarn test` and `yarn build` before pushing.
4. Describe what changed and why.

## Safety-critical code

`src/model/reasoning/escalation-policy.ts` and
`src/model/reasoning/danger-signs.ts` implement the pregnancy-safety floor
that the project's KPI commitments depend on (zero unescalated
safety-critical pregnancy cases). Changes here need the eval harness
(`src/model/eval/harness.ts`) re-run and its pregnancy-safety canary set
passing at 100% — a single miss fails the suite by design.

## Code of Conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
