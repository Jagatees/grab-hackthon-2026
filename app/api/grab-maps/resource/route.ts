import { NextRequest } from "next/server";
import {
  assertGrabMapsTarget,
  getGrabMapsApiKey,
  normalizeGrabMapsUrl
} from "@/lib/grab-maps";

const BLOCKED_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "transfer-encoding"
]);

export async function GET(request: NextRequest) {
  try {
    const encodedUrl = request.nextUrl.searchParams.get("url");

    if (!encodedUrl) {
      return Response.json(
        {
          error: "Missing resource url."
        },
        { status: 400 }
      );
    }

    const targetUrl = normalizeGrabMapsUrl(assertGrabMapsTarget(encodedUrl));
    const upstream = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${getGrabMapsApiKey()}`
      },
      cache: "force-cache"
    });

    const headers = new Headers();

    upstream.headers.forEach((value, key) => {
      if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    headers.set("Cache-Control", upstream.ok ? "public, max-age=3600" : "no-store");

    return new Response(upstream.body, {
      status: upstream.status,
      headers
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load GrabMaps resource.";

    return Response.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}
