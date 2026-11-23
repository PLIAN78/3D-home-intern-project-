import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * "Caivan: Build It!" — a separate app (own dev server and build) that reuses
 * Home Studio's code: `@/…` resolves to the repo root, exactly as in the
 * Next.js app, so communities, house geometry and materials are shared.
 */
const repoRoot = path.resolve(import.meta.dirname, "..");

export default defineConfig(({ mode }) => {
  // Shared code reads `process.env.NEXT_PUBLIC_*` (Next.js inlines those); give Vite the same values.
  const env: Record<string, string> = { NODE_ENV: mode === "production" ? "production" : "development" };
  // Same sources as Next.js: the repo's .env files, then the shell (loadEnv merges both).
  Object.assign(env, loadEnv(mode, repoRoot, "NEXT_PUBLIC_"));
  return {
    root: import.meta.dirname,
    // Relative asset paths, so the built game works from any folder or sub-path.
    base: "./",
    plugins: [react()],
    define: { "process.env": JSON.stringify(env) },
    resolve: { alias: [{ find: /^@\//, replacement: repoRoot + "/" }] },
    server: { port: 5180, fs: { allow: [repoRoot] } },
    preview: { port: 5181 },
    build: { outDir: path.resolve(repoRoot, "dist-game"), emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  };
});
