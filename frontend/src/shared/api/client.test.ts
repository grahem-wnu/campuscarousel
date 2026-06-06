import { describe, it, expect, vi } from "vitest";
import { createApiClient } from "./client";
import { ApiError } from "./types";

/** Build a stub Response without needing a DOM. */
function jsonResponse(status: number, body: unknown): Response {
  const text = body === undefined ? "" : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A vi.fn typed like fetch so mock.calls carries [url, init]. */
function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  return vi.fn(impl);
}

describe("createApiClient", () => {
  it("attaches the bearer token and Content-Type on a POST with a body", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(200, { id: "a1" }));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => "tok-123",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const out = await client.post<{ id: string }>("/activities", { title: "Read" });

    expect(out).toEqual({ id: "a1" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/activities");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok-123");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ title: "Read" }));
    expect(init.method).toBe("POST");
  });

  it("omits Authorization when no token is available", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(200, []));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.get("/activities");
    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("builds query strings and drops null/undefined values", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(200, []));
    const client = createApiClient({
      baseUrl: "https://api.example.com/",
      getToken: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.get("/colleges", { query: { state: "MI", topPick: true, q: undefined } });
    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/colleges?state=MI&topPick=true");
  });

  it("parses the error envelope into a typed ApiError", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse(403, { error: { code: "forbidden", message: "Not your entry" } }),
    );
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.get("/journal/secret")).rejects.toMatchObject({
      name: "ApiError",
      code: "forbidden",
      status: 403,
      message: "Not your entry",
    });
  });

  it("synthesizes a code from the status when the error body is not JSON", async () => {
    const fetchImpl = mockFetch(
      async () => new Response("gateway boom", { status: 500, statusText: "Server Error" }),
    );
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const err = await client.get("/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("internal");
    expect((err as ApiError).status).toBe(500);
  });

  it("returns undefined for 204 No Content", async () => {
    const fetchImpl = mockFetch(async () => new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const out = await client.del("/activities/a1");
    expect(out).toBeUndefined();
  });
});
