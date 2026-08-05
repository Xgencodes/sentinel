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
  // nothing.
  schemaFilter: ['public', 'sentinel_registry', 'sentinel_core'],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
