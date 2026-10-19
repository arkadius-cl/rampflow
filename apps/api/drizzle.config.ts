import { defineConfig } from 'drizzle-kit';

// `generate` needs no database. `migrate` connects as the owner role (ADR-0001).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/schema*.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL ?? '' },
  migrations: { table: '__drizzle_migrations', schema: 'drizzle' },
  strict: true,
  verbose: true,
});
