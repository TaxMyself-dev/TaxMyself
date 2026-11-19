import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';

type Metadata = Record<string, string | number | boolean | undefined>;
type Span = {
  id: string;
  parent?: string;
  name: string;
  start: string;
  end?: string;
  input: unknown;
  output?: unknown;
  failed?: boolean;
  error?: string;
  attributes: Metadata;
  override?: boolean;
};
type Config = {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
  environment: string;
  sampleRate: number;
};
type Root = {
  id: string;
  name: string;
  config: Config;
  metadata: Metadata;
  spans: Span[];
};
const context = new AsyncLocalStorage<{ root: Root; span: Span }>();

export function localOnboardingTraceConfig(env = process.env): Config | null {
  if (
    env.LANGFUSE_ONBOARDING_ENABLED === 'false' ||
    !env.LANGFUSE_PUBLIC_KEY ||
    !env.LANGFUSE_SECRET_KEY ||
    !env.LANGFUSE_BASE_URL
  )
    return null;
  try {
    const url = new URL(env.LANGFUSE_BASE_URL);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['', '/'].includes(url.pathname)
    )
      return null;
    const rate = Number(env.LANGFUSE_SAMPLE_RATE ?? 1);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1) return null;
    return {
      baseUrl: url.origin,
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      environment: env.LANGFUSE_TRACING_ENVIRONMENT || 'development',
      sampleRate: rate,
    };
  } catch {
    return null;
  }
}

// Same phone/email masking as the main agent. Credential/header values must
// never enter a trace; the model request contains its body, never auth headers.
export function maskOnboardingTrace(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const clean = (item: any): any => {
    if (typeof item === 'string')
      return item
        .replace(
          /[\dA-Za-z][\w.+-]{0,63}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/gu,
          '[email]',
        )
        .replace(
          /(?<![\d+])(?:\+?972[- ]?|0)(?:5\d|7\d|[2-489])[- ]?\d{3}[- ]?\d{4}(?!\d)/gu,
          '[phone]',
        )
        .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{8,}/gu, '[credential]')
        .replace(/\bBearer\s+\S+/giu, 'Bearer [credential]');
    if (item == null || typeof item === 'number' || typeof item === 'boolean')
      return item;
    if (typeof item !== 'object') return String(item);
    if (item instanceof Date) return item.toISOString();
    if (seen.has(item)) return '[circular]';
    seen.add(item);
    const result = Array.isArray(item)
      ? item.map(clean)
      : Object.fromEntries(
          Object.entries(item).map(([key, v]) => [
            key,
            /^(authorization|cookie|set-cookie|password|secret|secretKey|apiKey|api_key|access_token|refresh_token)$/iu.test(
              key,
            )
              ? '[credential]'
              : clean(v),
          ]),
        );
    seen.delete(item);
    return result;
  };
  try {
    return clean(value);
  } catch {
    return '[unserializable trace value]';
  }
}

const timestamp = () => (BigInt(Date.now()) * BigInt(1000000)).toString();
const json = (value: unknown) =>
  JSON.stringify(maskOnboardingTrace(value ?? null));

/** Isolated OTLP/HTTP JSON exporter: no global OTel provider or agent dependency. */
export class OnboardingTracing {
  private readonly pending = new Set<Promise<void>>();
  private readonly logger = new Logger('OnboardingLangfuse');
  private lastWarning = 0;
  constructor(
    private readonly transport: typeof fetch = (...args) => fetch(...args),
  ) {}

  async run<T>(
    name: string,
    input: unknown,
    work: () => Promise<T> | T,
    metadata: Metadata = {},
    attributes: Metadata = {},
  ): Promise<T> {
    const parent = context.getStore();
    if (parent && !parent.root) return work();
    const config = parent?.root.config ?? localOnboardingTraceConfig();
    if (!config || (!parent && Math.random() >= config.sampleRate))
      return context.run({ root: null, span: null }, work);
    const root = parent?.root ?? {
      id: randomBytes(16).toString('hex'),
      name,
      config,
      metadata: { ...metadata },
      spans: [],
    };
    const span: Span = {
      id: randomBytes(8).toString('hex'),
      parent: parent?.span.id,
      name,
      start: timestamp(),
      input: maskOnboardingTrace(input),
      attributes,
    };
    try {
      return await context.run({ root, span }, async () => {
        try {
          const output = await work();
          if (!span.override)
            span.output = maskOnboardingTrace(
              output === undefined ? { completed: true } : output,
            );
          return output;
        } catch (error) {
          span.failed = true;
          span.error = String(
            maskOnboardingTrace(
              error instanceof Error ? error.message : 'STAGE_FAILED',
            ),
          );
          throw error;
        }
      });
    } finally {
      span.end = timestamp();
      root.spans.push(span);
      if (!parent) this.enqueue(root);
    }
  }

  record(name: string, input: unknown, output: unknown) {
    const state = context.getStore();
    if (!state?.root) return;
    const time = timestamp();
    state.root.spans.push({
      id: randomBytes(8).toString('hex'),
      parent: state.span.id,
      name,
      start: time,
      end: time,
      input: maskOnboardingTrace(input),
      output: maskOnboardingTrace(output),
      attributes: {},
    });
  }
  metadata(metadata: Metadata) {
    const state = context.getStore();
    if (state?.root) Object.assign(state.root.metadata, metadata);
  }
  attributes(attributes: Metadata) {
    const state = context.getStore();
    if (state?.span) Object.assign(state.span.attributes, attributes);
  }
  output(output: unknown) {
    const state = context.getStore();
    if (state?.span) {
      state.span.output = maskOnboardingTrace(output);
      state.span.override = true;
    }
  }
  async flush() {
    await Promise.allSettled([...this.pending]);
  }

  private enqueue(root: Root) {
    // Do not let a slow local collector build an unbounded queue or delay chat.
    if (this.pending.size >= 32) {
      this.warn('QUEUE_FULL');
      return;
    }
    const task = this.export(root).catch(() => this.warn('EXPORT_FAILED'));
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }
  private warn(reason: string) {
    if (Date.now() - this.lastWarning < 30000) return;
    this.lastWarning = Date.now();
    this.logger.warn(
      `Local onboarding trace unavailable (${reason}); conversation unaffected`,
    );
  }
  private async export(root: Root) {
    const value = (v: unknown) =>
      typeof v === 'boolean'
        ? { boolValue: v }
        : typeof v === 'number'
        ? { doubleValue: v }
        : { stringValue: String(v) };
    const metadata = { ...root.metadata };
    const common: Metadata = {
      'langfuse.trace.name': root.name,
      'langfuse.environment': root.config.environment,
      'langfuse.user.id': String(metadata.userId ?? 'onboarding-standalone'),
      'langfuse.session.id': `onboarding:${metadata.userId ?? 'standalone'}:${
        metadata.businessNumber ?? 'unselected'
      }`,
      'langfuse.trace.metadata.feature': 'onboarding',
    };
    for (const [key, v] of Object.entries(metadata))
      if (v !== undefined) {
        common[`langfuse.trace.metadata.${key}`] = v;
        common[`langfuse.observation.metadata.${key}`] = v;
      }
    const spans = root.spans.map((span) => {
      const attrs: Metadata = {
        ...common,
        'langfuse.observation.type': 'span',
        ...span.attributes,
        'langfuse.observation.input': json(span.input),
        'langfuse.observation.output': json(span.output),
        'langfuse.observation.level': span.failed ? 'ERROR' : 'DEFAULT',
      };
      if (span.error) attrs['langfuse.observation.status_message'] = span.error;
      return {
        traceId: root.id,
        spanId: span.id,
        ...(span.parent ? { parentSpanId: span.parent } : {}),
        name: span.name,
        kind: 1,
        startTimeUnixNano: span.start,
        endTimeUnixNano: span.end,
        status: {
          code: span.failed ? 2 : 1,
          ...(span.error ? { message: span.error } : {}),
        },
        attributes: Object.entries(attrs)
          .filter(([, v]) => v !== undefined)
          .map(([key, v]) => ({ key, value: value(maskOnboardingTrace(v)) })),
      };
    });
    const response = await this.transport(
      `${root.config.baseUrl}/api/public/otel/v1/traces`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(2000),
        headers: {
          'Content-Type': 'application/json',
          'x-langfuse-ingestion-version': '4',
          Authorization:
            'Basic ' +
            Buffer.from(
              root.config.publicKey + ':' + root.config.secretKey,
            ).toString('base64'),
        },
        body: JSON.stringify({
          resourceSpans: [
            {
              resource: {
                attributes: [
                  {
                    key: 'service.name',
                    value: { stringValue: 'keepintax-onboarding' },
                  },
                ],
              },
              scopeSpans: [
                {
                  scope: { name: 'keepintax.onboarding', version: '1' },
                  spans,
                },
              ],
            },
          ],
        }),
      },
    );
    if (!response.ok) throw new Error('LOCAL_EXPORT_REJECTED');
    const result = await response.json().catch(() => ({}));
    if (Number(result.partialSuccess?.rejectedSpans ?? 0) > 0)
      throw new Error('LOCAL_EXPORT_PARTIALLY_REJECTED');
  }
}

export const onboardingTracing = new OnboardingTracing();

/** Public requests and nested profile reads share AsyncLocalStorage context. */
export function TraceOnboarding(operation: string): MethodDecorator {
  return (_target, _key, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const user = args[0];
      const input = args.slice(1);
      const businessNumber =
        typeof args[1] === 'string' ? args[1] : args[1]?.businessNumber;
      return onboardingTracing.run(
        `onboarding.${operation}`,
        input,
        () => original.apply(this, args),
        {
          userId: user?.firebaseId,
          businessNumber,
          ...(operation === 'commit' ? { proposalId: args[2] } : {}),
        },
      );
    };
  };
}

export function TraceOnboardingStage(name: string): MethodDecorator {
  return (_target, _key, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = function (...args: any[]) {
      return onboardingTracing.run(name, args, () =>
        original.apply(this, args),
      );
    };
  };
}
