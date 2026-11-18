/** A failed request to the app's own API, with the message the server wrote for the student. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Calls the app's JSON API and returns the parsed response, or throws ApiError. */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Couldn't reach Study Coach. Check your connection and try again.", 0, "offline");
  }
  const data = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      // A full page load on purpose: it drops every cached page from the signed-in state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/sign-in");
    }
    throw new ApiError(data?.error ?? "Something went wrong. Try again.", response.status, data?.code);
  }
  return data as T;
}

/**
 * Error codes that mean a check could not be written or graded at all (Claude
 * unreachable, busy or out of requests for the day; nothing usable written; no
 * materials left). The student did nothing wrong, so they may go on without it.
 */
const CHECK_BLOCKERS = new Set([
  "ai_limit",
  "ai_ceiling",
  "ai_unavailable",
  "ai_busy",
  "ai_refusal",
  "ai_output",
  "ai_input",
  "no_material",
]);

/** True when a failed check request is one the student can do nothing about. */
export function blocksCheck(error: unknown): boolean {
  return error instanceof ApiError && error.code !== undefined && CHECK_BLOCKERS.has(error.code);
}

/** The message to show for anything a request threw. */
export function messageFrom(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Try again.";
}
