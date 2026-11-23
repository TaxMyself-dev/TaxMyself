import * as path from 'path';
import { pathToFileURL } from 'url';
import { withAgentBackgroundContext } from './agent-background-context';

// Shared by the Nest harness and the offline final-image check. Keep the real
// dynamic import: the backend's CommonJS compilation rewrites import().
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importModule = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

export const agentPackageDir = path.resolve(__dirname, '../../agent');

export const loadAgentBundle = (): Promise<unknown> =>
  withAgentBackgroundContext(() =>
    importModule(pathToFileURL(
      process.env.AGENT_BUNDLE_PATH || path.join(agentPackageDir, 'dist/agent-http.mjs'),
    ).href),
  );
