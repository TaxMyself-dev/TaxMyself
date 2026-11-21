import { ConfigProvider, Layer } from "effect";
import { FetchHttpClient } from "effect/http";

/**
 * A live HTTP-client service layer (JevClient.layer, OpenAiResponses.layer)
 * whose requests a fake fetch answers and whose configuration comes from
 * `config` alone (an empty record: no API key), so tests never touch the
 * global fetch or process.env.
 *
 * @param layer - The service's live layer.
 * @param fakeFetch - Answers its requests, at once or later; a throw is a
 *   failed fetch.
 * @param config - Its configuration values.
 * @returns The layer, provided.
 */
export const withFakeFetch = <Service>(
  layer: Layer.Layer<Service>,
  fakeFetch: (
    ...args: Parameters<typeof globalThis.fetch>
  ) => Response | Promise<Response>,
  config: Record<string, string>
) =>
  layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(
          FetchHttpClient.Fetch,
          async (...args: Parameters<typeof globalThis.fetch>) =>
            await fakeFetch(...args)
        ),
        ConfigProvider.layer(ConfigProvider.fromUnknown(config))
      )
    )
  );
