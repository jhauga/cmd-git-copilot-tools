/**
 * Replace the global fetch for the duration of a test. Known URLs answer with
 * the route given; every other URL answers 404 the way the GitHub API does.
 */

export interface StubRoute {
  /** HTTP status (default: 200). */
  status?: number;
  headers?: Record<string, string>;
  /** Response body; objects are serialized as JSON. */
  body?: string | object;
}

export interface FetchStub {
  /** URLs requested through the stub, in order. */
  calls: string[];
}

type FetchFn = typeof fetch;

export async function withFetchStub(
  routes: Record<string, StubRoute>,
  fn: (stub: FetchStub) => Promise<void> | void
): Promise<void> {
  const target = globalThis as { fetch: FetchFn };
  const original = target.fetch;
  const stub: FetchStub = { calls: [] };

  target.fetch = (async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    stub.calls.push(url);
    const route = routes[url] ?? { status: 404, body: { message: 'Not Found' } };
    const body = route.body === undefined
      ? ''
      : typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
    return new Response(body, { status: route.status ?? 200, headers: route.headers ?? {} });
  }) as FetchFn;

  try {
    await fn(stub);
  } finally {
    target.fetch = original;
  }
}

/** Encode text the way the contents API returns a file body. */
export function toBase64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}
