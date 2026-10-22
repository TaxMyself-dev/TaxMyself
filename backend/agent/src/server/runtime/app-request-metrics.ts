import { Effect, Metric } from "effect";

// Every response the app server sends, as rate, errors and duration metrics
// (Grafana's request panels and the server-error alert,
// scripts/grafana/publish-grafana.ts), recorded by the response hook in
// app-runtime.server.ts. Labels stay few: the method, the status, and the
// path with ids and long tokens replaced, so one page per user is one series.

const appHttpRequests = Metric.counter("app_http_requests", {
  description: "Responses the app server sent, by method, route and status",
  incremental: true,
});

const appHttpRequestSeconds = Metric.histogram("app_http_request_seconds", {
  description:
    "How long the app server took to start each response, by method and route",
  boundaries: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
});

// A path segment that names one record rather than a page: a UUID, a number,
// an account id, or a long token such as a server function's id.
const recordSegmentPatterns = [
  /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu,
  /^\d+$/u,
  /^[\w-]{32,}$/u,
];

const isRecordSegment = (segment: string) =>
  recordSegmentPatterns.some((pattern) => pattern.test(segment));

/**
 * A request's route for metrics: its path with record ids as :id.
 *
 * @param url - The request's URL.
 * @returns The route.
 */
export const appRequestRoute = (url: string) =>
  new URL(url).pathname
    .split("/")
    .map((segment) => (isRecordSegment(segment) ? ":id" : segment))
    .join("/");

/**
 * Records one response's count and duration by route, method and status.
 *
 * @param request - The request.
 * @param response - Its response.
 * @param seconds - How long it took.
 * @returns An Effect that records the metrics.
 */
export const recordAppResponse = (
  request: Request,
  response: Response,
  seconds: number
) => {
  const route = appRequestRoute(request.url);

  return Effect.all(
    [
      Metric.update(
        Metric.withAttributes(appHttpRequests, {
          method: request.method,
          route,
          status: String(response.status),
        }),
        1
      ),
      Metric.update(
        Metric.withAttributes(appHttpRequestSeconds, {
          method: request.method,
          route,
        }),
        seconds
      ),
    ],
    { discard: true }
  );
};
