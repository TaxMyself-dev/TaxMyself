import { AsyncLocalStorage } from 'node:async_hooks';

// Network errors often have only node:net frames. Attribute background promises
// to the agent by their async origin, not just their eventual error stack.
const agentContext = new AsyncLocalStorage<boolean>();

export const withAgentBackgroundContext = <T>(run: () => T): T =>
  agentContext.run(true, run);

export const installAgentRejectionGuard = (
  logger: { error: (message: string, detail: string) => void },
  packageDir: string,
): (() => void) => {
  const onRejection = (reason: unknown) => {
    const stack = reason instanceof Error ? reason.stack ?? '' : '';
    const agentStack = stack
      .replace(/\\/g, '/')
      .includes(packageDir.replace(/\\/g, '/'));
    if (agentContext.getStore() === true || agentStack) {
      // Logging must not create a second uncaught exception.
      try {
        logger.error('AGENT_UNHANDLED_REJECTION', stack || String(reason));
      } catch {
        /* best effort */
      }
      return;
    }
    // Preserve Node's fatal behavior for unrelated programming failures.
    throw reason;
  };
  process.on('unhandledRejection', onRejection);
  return () => {
    process.off('unhandledRejection', onRejection);
  };
};
