import { getGrabErrorMessage, parseGrabResponse } from "@/lib/grab-response";
import { buildGrabMapsUrl, getGrabMapsApiKey } from "@/lib/grab-maps";

type GrabPlace = {
  poi_id?: string;
  id?: string;
  name?: string;
  formatted_address?: string;
  business_type?: string;
  category?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
};

type DirectionResult = {
  distance?: number;
  duration?: number;
  geometry?: string;
  legs?: Array<{
    distance?: number;
    duration?: number;
  }>;
  traffic_light?: number;
};

async function fetchGrabJson(url: URL) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${getGrabMapsApiKey()}`
    },
    cache: "no-store"
  });

  const { payload, text } = await parseGrabResponse(response);

  if (!response.ok) {
    throw new Error(
      getGrabErrorMessage(response, payload, "Grab request failed.", text)
    );
  }

  return payload ?? {};
}

export async function searchGrabPlaces(params: {
  keyword: string;
  country?: string;
  location?: string;
  limit?: number;
}) {
  const url = buildGrabMapsUrl("/api/v1/maps/poi/v1/search");
  url.searchParams.set("keyword", params.keyword);

  if (params.country) {
    url.searchParams.set("country", params.country);
  }

  if (params.location) {
    url.searchParams.set("location", params.location);
  }

  if (params.limit) {
    url.searchParams.set("limit", String(params.limit));
  }

  const payload = await fetchGrabJson(url);
  return (payload.places as GrabPlace[] | undefined) ?? [];
}

export async function nearbyGrabPlaces(params: {
  location: string;
  radius?: number;
  limit?: number;
  rankBy?: string;
  language?: string;
}) {
  const url = buildGrabMapsUrl("/api/v1/maps/place/v2/nearby");
  url.searchParams.set("location", params.location);

  if (params.radius) {
    url.searchParams.set("radius", String(params.radius));
  }

  if (params.limit) {
    url.searchParams.set("limit", String(params.limit));
  }

  if (params.rankBy) {
    url.searchParams.set("rankBy", params.rankBy);
  }

  if (params.language) {
    url.searchParams.set("language", params.language);
  }

  const payload = await fetchGrabJson(url);
  return (payload.places as GrabPlace[] | undefined) ?? [];
}

export async function getGrabDirection(params: {
  coordinates: Array<[number, number]>;
  profile?: string;
  overview?: "full";
  avoid?: string[];
}) {
  const url = buildGrabMapsUrl("/api/v1/maps/eta/v1/direction");

  for (const [lng, lat] of params.coordinates) {
    url.searchParams.append("coordinates", `${lng.toFixed(6)},${lat.toFixed(6)}`);
  }

  url.searchParams.set("profile", params.profile ?? "driving");
  url.searchParams.set("overview", params.overview ?? "full");

  if (params.avoid && params.avoid.length > 0) {
    url.searchParams.set("avoid", params.avoid.join(","));
  }

  const payload = await fetchGrabJson(url);

  return {
    waypoints: (payload.waypoints as Array<Record<string, unknown>> | undefined) ?? [],
    route: ((payload.routes as DirectionResult[] | undefined) ?? [])[0]
  };
}

export type { GrabPlace, DirectionResult };
