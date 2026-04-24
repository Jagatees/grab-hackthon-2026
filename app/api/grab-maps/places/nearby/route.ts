import { NextRequest } from "next/server";
import { getGrabErrorMessage, parseGrabResponse } from "@/lib/grab-response";
import { buildGrabMapsUrl, getGrabMapsApiKey } from "@/lib/grab-maps";

export async function GET(request: NextRequest) {
  try {
    const targetUrl = buildGrabMapsUrl(
      "/api/v1/maps/place/v2/nearby",
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
            "Unable to load nearby GrabMaps places.",
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

    return Response.json(payload ?? {}, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load nearby GrabMaps places.";

    return Response.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}
