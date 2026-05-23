import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['']);
  const assignedPort = Number(env.PORT || env.VITE_PORT || 5175);
  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'services__'],
    server: { port: assignedPort, host: true, strictPort: true },
  };
});
