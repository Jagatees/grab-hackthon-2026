import { NextRequest } from "next/server";
import { getGrabErrorMessage, parseGrabResponse } from "@/lib/grab-response";
import { getGrabMapsApiKey, getGrabMapsBaseUrl } from "@/lib/grab-maps";

export async function GET(request: NextRequest) {
  try {
    const targetUrl = new URL(
      "/api/v1/maps/eta/v1/direction",
      getGrabMapsBaseUrl()
    );

    for (const [key, value] of request.nextUrl.searchParams.entries()) {
      targetUrl.searchParams.append(key, value);
    }

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
            "Unable to load GrabMaps route.",
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
      error instanceof Error ? error.message : "Unable to load GrabMaps route.";

    return Response.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}
