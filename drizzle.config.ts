import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit reads this to generate SQL migration files from schema.ts and
 * to apply them. Workflow (also in package.json scripts):
 *
 *   npm run db:generate   diff schema.ts against ./drizzle, write a new .sql
 *   npm run db:migrate    apply pending .sql files to DATABASE_URL
 *
 * Migrations are committed files — the database's history lives in git like
 * everything else, and CI can prove a fresh database reaches the same state.
 */
export default defineConfig({
  schema: "./src/shared/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
