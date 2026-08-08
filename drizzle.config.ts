import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  schema: ['./src/registry/schema.ts', './src/database/core-schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  // Tables live in sentinel_registry/sentinel_core, not public — without
  // this, `drizzle-kit push` only introspects `public`, silently compares
  // it against an empty diff, and reports "no changes" while creating
  // nothing. `public` itself is deliberately excluded: no sentinel table
  // lives there, and in the composed sentinel-stack deployment `public` is
  // where ehr-bridge's tables live in the same shared Postgres — including
  // it here makes drizzle-kit's rename-detection heuristic compare
  // sentinel's new tables against ehr-bridge's unrelated ones, which
  // triggers an interactive "created or renamed?" prompt that hangs
  // forever in a non-interactive container.
  schemaFilter: ['sentinel_registry', 'sentinel_core'],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
