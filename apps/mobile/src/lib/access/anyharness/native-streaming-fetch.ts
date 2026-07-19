import { Platform } from "react-native";
import { fetch as expoStreamingFetch } from "expo/fetch";

/**
 * `@anyharness/sdk`'s `streamSession` (`anyharness/sdk/src/streams/sessions.ts`)
 * reads the live transcript over `text/event-stream` via the platform's
 * global `fetch` + `response.body.getReader()`. That's the right call for a
 * shared package used by both the web client and mobile — but React
 * Native's built-in `fetch` does not stream a response body; it buffers the
 * whole response before resolving, so a long-lived SSE connection would
 * never deliver events until the connection eventually closed (or would
 * throw immediately if `response.body` isn't a `ReadableStream` at all).
 *
 * Expo SDK 56 ships `expo/fetch`, a fetch implementation backed by native
 * networking specifically to support streaming response bodies
 * (`FetchResponse.body: ReadableStream<Uint8Array> | null`) — a drop-in
 * `fetch`-shaped function. `streamSession` calls the bare `fetch` identifier,
 * which resolves through `globalThis.fetch` at call time; since calling an
 * async function runs synchronously up to (and including evaluating the
 * arguments of) its first `await`, swapping `globalThis.fetch` immediately
 * before calling `streamSession(...)` and restoring it immediately after is
 * enough to route *only* that call through the streaming-capable fetch,
 * without touching `fetch` for anything else in the app (React Query, other
 * SDK calls, etc).
 *
 * Web (Expo web target) already has a real streaming `fetch`, so this is a
 * no-op there.
 */
export function callWithStreamingFetch<T>(fn: () => T): T {
  if (Platform.OS === "web") {
    return fn();
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = expoStreamingFetch as unknown as typeof fetch;
  try {
    return fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
