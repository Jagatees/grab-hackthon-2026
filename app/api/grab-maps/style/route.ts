import { NextRequest } from "next/server";
import { getGrabErrorMessage, parseGrabResponse } from "@/lib/grab-response";
import {
  buildGrabMapsUrl,
  getGrabMapsApiKey,
  normalizeGrabMapsUrl,
  serializeGrabMapsUrl
} from "@/lib/grab-maps";

function sanitizeStyle(style: unknown) {
  if (!style || typeof style !== "object") {
    return style;
  }

  const typedStyle = style as {
    sources?: Record<string, { tiles?: string[] }>;
    layers?: Array<{ source?: string }>;
    sprite?: string;
    glyphs?: string;
  };

  const nextSources = Object.fromEntries(
    Object.entries(typedStyle.sources ?? {}).map(([sourceName, source]) => [
      sourceName,
      {
        ...source,
        tiles: source.tiles?.map((tileUrl) =>
          serializeGrabMapsUrl(tileUrl)
        )
      }
    ])
  );

  const blockedSources = new Set(
    Object.entries(nextSources)
      .filter(([, source]) =>
        source.tiles?.some((tileUrl) => tileUrl.includes("internal-poi-v3"))
      )
      .map(([sourceName]) => sourceName)
  );

  if (blockedSources.size === 0) {
    return {
      ...typedStyle,
      sources: nextSources,
      sprite: typedStyle.sprite
        ? serializeGrabMapsUrl(typedStyle.sprite)
        : typedStyle.sprite,
      glyphs: typedStyle.glyphs
        ? serializeGrabMapsUrl(typedStyle.glyphs)
        : typedStyle.glyphs
    };
  }

  const filteredSources = Object.fromEntries(
    Object.entries(nextSources).filter(
      ([sourceName]) => !blockedSources.has(sourceName)
    )
  );

  const nextLayers = (typedStyle.layers ?? []).filter(
    (layer) => !layer.source || !blockedSources.has(layer.source)
  );

  return {
    ...typedStyle,
    sources: filteredSources,
    layers: nextLayers,
    sprite: typedStyle.sprite
      ? serializeGrabMapsUrl(typedStyle.sprite)
      : typedStyle.sprite,
    glyphs: typedStyle.glyphs
      ? serializeGrabMapsUrl(typedStyle.glyphs)
      : typedStyle.glyphs
  };
}

export async function GET(request: NextRequest) {
  try {
    const targetUrl = buildGrabMapsUrl(
      "/api/style.json",
      request.nextUrl.searchParams
    );
    const response = await fetch(targetUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${getGrabMapsApiKey()}`
      },
      cache: "no-store"
    });

    const { payload, text } = await parseGrabResponse(response);

    if (!response.ok) {
      return Response.json(
        {
          error: getGrabErrorMessage(
            response,
            payload,
            "Unable to load GrabMaps style.",
            text
          )
        },
        {
          status: response.status,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const sanitizedStyle = sanitizeStyle(payload);

    return Response.json(sanitizedStyle, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load GrabMaps style.";

    return Response.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}
