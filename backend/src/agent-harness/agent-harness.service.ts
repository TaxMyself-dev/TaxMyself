import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as path from 'path';
import { pathToFileURL } from 'url';

/**
 * The verified user the agent package serves a request for — the fields of
 * FirebaseAuthGuard's request it reads (backend/agent/src/server/runtime/
 * supabase-client.ts, AgentRequestUser).
 */
export interface AgentHarnessUser {
  actorFirebaseId: string;
  firebaseId: string;
  businessNumber: string | null;
  delegationScopes: string[];
  isDelegatedAccess: boolean;
  isAdminImpersonation: boolean;
}

/**
 * The agent package's HTTP entry (backend/agent/src/server/agent-http.server.ts),
 * as its bundle exports it.
 */
interface AgentHarnessBundle {
  handleAgentHttpRequest: (
    request: Request,
    user: AgentHarnessUser,
  ) => Promise<Response>;
  disposeAppRuntime: () => Promise<void>;
}

// The bundle is an ES module (Effect 4 and AI SDK 7 are ESM-only), and this
// backend compiles to CommonJS, which turns `import()` into `require()`. A
// function built at runtime keeps a real dynamic import.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importModule = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

/**
 * Loads the agent package's bundle (backend/agent/dist/agent-http.mjs, built
 * by `npm run build` in backend/agent) on the first agent request, so the Nest
 * backend starts — and serves everything else — whether or not the agent is
 * built or configured. AGENT_BUNDLE_PATH points it elsewhere.
 */
@Injectable()
export class AgentHarnessService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentHarnessService.name);
  private bundle: Promise<AgentHarnessBundle> | null = null;

  private bundlePath() {
    return (
      process.env.AGENT_BUNDLE_PATH ||
      path.resolve(__dirname, '../../agent/dist/agent-http.mjs')
    );
  }

  load(): Promise<AgentHarnessBundle> {
    if (!this.bundle) {
      const file = this.bundlePath();
      this.bundle = importModule(pathToFileURL(file).href).then(
        (loaded) => loaded as AgentHarnessBundle,
      );
      this.bundle.catch((error: unknown) => {
        this.logger.error(
          `AGENT_BUNDLE_UNAVAILABLE: ${file} could not be loaded (run npm run build in backend/agent)`,
          error instanceof Error ? error.stack : String(error),
        );
        // A later request tries again, after a build.
        this.bundle = null;
      });
    }

    return this.bundle;
  }

  async handle(request: Request, user: AgentHarnessUser): Promise<Response> {
    const bundle = await this.load();

    return await bundle.handleAgentHttpRequest(request, user);
  }

  async onModuleDestroy() {
    if (!this.bundle) {
      return;
    }

    try {
      const bundle = await this.bundle;
      await bundle.disposeAppRuntime();
    } catch {
      // Not loaded: nothing to dispose.
    }
  }
}
