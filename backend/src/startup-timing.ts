import { RequestHandler } from 'express';

export const STARTUP_TIMING_PREFIX = '[startup-timing] ';

type TimingSink = (line: string) => void;

export interface StartupTimingEvent {
  event: string;
  duration_ms?: number;
  elapsed_ms: number;
  process_to_request_ms?: number;
  kind?: 'milestone';
}

function milliseconds(nanoseconds: bigint): number {
  return Number(nanoseconds) / 1_000_000;
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

export function isStartupTimingEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.STARTUP_TIMING === 'true';
}

export class StartupTiming {
  private readonly processStartedAt: bigint;

  constructor(
    private readonly sink: TimingSink = console.log,
    private readonly now: () => bigint = process.hrtime.bigint,
    processUptimeSeconds: number = process.uptime(),
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {
    this.processStartedAt =
      this.now() - BigInt(Math.round(processUptimeSeconds * 1_000_000_000));
  }

  isEnabled(): boolean {
    return isStartupTimingEnabled(this.environment);
  }

  start(): bigint {
    return this.now();
  }

  mark(event: string, kind?: 'milestone'): void {
    if (!this.isEnabled()) return;
    this.emit({
      event,
      elapsed_ms: rounded(milliseconds(this.now() - this.processStartedAt)),
      ...(kind ? { kind } : {}),
    });
  }

  complete(event: string, startedAt: bigint): void {
    if (!this.isEnabled()) return;
    const completedAt = this.now();
    this.emit({
      event,
      duration_ms: rounded(milliseconds(completedAt - startedAt)),
      elapsed_ms: rounded(milliseconds(completedAt - this.processStartedAt)),
    });
  }

  completeFromProcessStart(event: string): void {
    if (!this.isEnabled()) return;
    const elapsed = rounded(milliseconds(this.now() - this.processStartedAt));
    this.emit({ event, duration_ms: elapsed, elapsed_ms: elapsed });
  }

  async measureAsync<T>(
    event: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!this.isEnabled()) return operation();
    const startedAt = this.start();
    try {
      return await operation();
    } finally {
      this.complete(event, startedAt);
    }
  }

  firstRequestMiddleware(): RequestHandler {
    let firstRequestSeen = false;
    return (_request, response, next) => {
      if (!this.isEnabled() || firstRequestSeen) {
        next();
        return;
      }

      firstRequestSeen = true;
      const requestStartedAt = this.now();
      let emitted = false;
      const complete = () => {
        if (emitted) return;
        emitted = true;
        const completedAt = this.now();
        this.emit({
          event: 'http.first_request.complete',
          duration_ms: rounded(milliseconds(completedAt - requestStartedAt)),
          elapsed_ms: rounded(
            milliseconds(completedAt - this.processStartedAt),
          ),
          process_to_request_ms: rounded(
            milliseconds(requestStartedAt - this.processStartedAt),
          ),
        });
      };

      response.once('finish', complete);
      response.once('close', complete);
      next();
    };
  }

  private emit(event: StartupTimingEvent): void {
    this.sink(`${STARTUP_TIMING_PREFIX}${JSON.stringify(event)}`);
  }
}

export const startupTiming = new StartupTiming();
