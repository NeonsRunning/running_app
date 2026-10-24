import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests: plain functions and server code with its outside world (Stripe,
 * Supabase, Brevo) mocked. What the database itself enforces — row-level
 * security, the SQL functions — is tested in `supabase/tests`, against a real
 * Postgres, by `supabase test db`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // Throws outside a React Server Components build; tests run plain Node.
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "supabase/**"],
    environment: "node",
  },
});
