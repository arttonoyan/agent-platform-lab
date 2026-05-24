import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { mvpBackendPlugin } from './server/plugin';

/**
 * AI Tooling Platform OneAdmin Vite config.
 *
 * The `mvpBackendPlugin` mounts a small server-side BFF at `/api/*` on both the dev
 * server and the preview server. That is where real OpenAPI fetches and real tool
 * executions happen — never in the browser. In production this BFF would be replaced
 * by a real backend service exposing the same paths.
 *
 * Aspire's AddNpmApp injects:
 *   PORT                            -> the assigned port for this resource
 *   services__<name>__https__0      -> downstream service URLs (kept for compat)
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['']);
  const assignedPort = Number(env.PORT || env.VITE_PORT || 5174);
  return {
    plugins: [react(), mvpBackendPlugin()],
    envPrefix: ['VITE_', 'services__'],
    server: {
      port: assignedPort,
      host: true,
      strictPort: true,
    },
    preview: {
      port: assignedPort,
      host: true,
      strictPort: true,
    },
  };
});
