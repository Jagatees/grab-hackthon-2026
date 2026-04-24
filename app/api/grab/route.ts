import { NextRequest, NextResponse } from "next/server";

type SupportedMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ProxyPayload = {
  path: string;
  method?: SupportedMethod;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
};

const ALLOWED_METHODS = new Set<SupportedMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE"
]);

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizePath(path: string) {
  const trimmed = path.trim();

  if (!trimmed.startsWith("/")) {
    throw new Error("Path must start with '/'.");
  }

  return trimmed;
}

function buildTargetUrl(
  baseUrl: string,
  path: string,
  query: ProxyPayload["query"]
) {
  const url = new URL(normalizePath(path), baseUrl);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function parseResponseBody(contentType: string | null, rawBody: string) {
  if (!rawBody) {
    return null;
  }

  if (contentType?.includes("application/json")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return rawBody;
    }
  }

  return rawBody;
}

export async function POST(request: NextRequest) {
  try {
    const baseUrl = getRequiredEnv("GRAB_API_BASE_URL");
    const token = getRequiredEnv("GRAB_API_TOKEN");

    const payload = (await request.json()) as ProxyPayload;
    const method = payload.method ?? "GET";

    if (!ALLOWED_METHODS.has(method)) {
      return NextResponse.json(
        { error: `Unsupported method '${method}'.` },
        { status: 400 }
      );
    }

    if (!payload.path) {
      return NextResponse.json(
        { error: "A relative Grab API path is required." },
        { status: 400 }
      );
    }

    const targetUrl = buildTargetUrl(baseUrl, payload.path, payload.query);
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    });

    for (const [key, value] of Object.entries(payload.headers ?? {})) {
      const headerName = key.toLowerCase();

      if (
        headerName === "authorization" ||
        headerName === "host" ||
        headerName === "content-length"
      ) {
        continue;
      }

      headers.set(key, value);
    }

    const hasBody = payload.body !== undefined && method !== "GET";

    if (hasBody && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? JSON.stringify(payload.body) : undefined,
      cache: "no-store"
    });

    const contentType = response.headers.get("content-type");
    const rawBody = await response.text();

    return NextResponse.json(
      {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        targetUrl: targetUrl.toString(),
        data: parseResponseBody(contentType, rawBody)
      },
      { status: response.ok ? 200 : response.status }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected proxy error.";

    return NextResponse.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}

