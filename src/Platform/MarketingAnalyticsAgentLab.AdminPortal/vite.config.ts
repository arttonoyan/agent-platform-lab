import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Aspire's AddNpmApp injects:
//   PORT                            -> the assigned port for this resource
//   services__<name>__https__0      -> downstream service URLs
// We expose anything starting with VITE_ or "services__" so the React code can read them.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['']);
  const assignedPort = Number(env.PORT || env.VITE_PORT || 5174);
  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'services__'],
    server: {
      port: assignedPort,
      host: true,
      strictPort: true,
    },
  };
});
