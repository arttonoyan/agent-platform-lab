import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApiRequest } from './router';

/**
 * Mount the AI Tooling Platform BFF on Vite's dev and preview servers.
 *
 * Effect: every request whose path starts with `/api/` is handled server-side by the
 * BFF instead of being rewritten to `index.html` by Vite. Everything else continues
 * to flow through Vite's normal HMR / asset / SPA pipeline.
 *
 * This is the seam between the React SPA and "real" backend behaviour. In production
 * the SPA would talk to the existing .NET services (PluginRegistry / AgentRuntime /
 * AiAssistantGateway) via the same `/api/*` paths; only the BFF mount point swaps.
 */
export function mvpBackendPlugin(): Plugin {
  return {
    name: 'mvp-backend',
    configureServer(server) {
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
          try {
            const handled = await handleApiRequest(req, res);
            if (!handled) next();
          } catch (err) {
            console.error('[mvp-bff] unhandled middleware error', err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ error: 'internal_error', message: (err as Error).message }));
            }
          }
        },
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
          try {
            const handled = await handleApiRequest(req, res);
            if (!handled) next();
          } catch (err) {
            console.error('[mvp-bff] preview middleware error', err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ error: 'internal_error', message: (err as Error).message }));
            }
          }
        },
      );
    },
  };
}
