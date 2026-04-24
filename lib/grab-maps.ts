const DEFAULT_GRAB_MAPS_BASE_URL = "https://maps.grab.com";

export function getGrabMapsBaseUrl() {
  return (
    process.env.GRAB_MAPS_BASE_URL ??
    process.env.GRAB_API_BASE_URL ??
    DEFAULT_GRAB_MAPS_BASE_URL
  ).replace(/\/+$/, "");
}

export function getGrabMapsApiKey() {
  const value = process.env.GRAB_MAPS_API_KEY ?? process.env.GRAB_API_TOKEN;

  if (!value) {
    throw new Error(
      "Missing GrabMaps API key. Set GRAB_MAPS_API_KEY or GRAB_API_TOKEN."
    );
  }

  return value;
}

export function buildGrabMapsUrl(pathname: string, search?: URLSearchParams) {
  const url = new URL(pathname, getGrabMapsBaseUrl());

  if (search) {
    search.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  return url;
}

export function assertGrabMapsTarget(target: string) {
  const url = new URL(target);

  if (url.origin !== getGrabMapsBaseUrl()) {
    throw new Error("Only GrabMaps URLs are allowed.");
  }

  return url;
}

export function normalizeGrabMapsUrl(target: string | URL) {
  const url = target instanceof URL ? new URL(target.toString()) : new URL(target);

  if (url.origin !== getGrabMapsBaseUrl()) {
    return url;
  }

  if (url.pathname.startsWith("/maps/tiles/")) {
    url.pathname = `/api${url.pathname}`;
  }

  return url;
}

export function serializeGrabMapsUrl(target: string | URL) {
  const normalized = normalizeGrabMapsUrl(target).toString();

  return normalized.replace(/%7B/gi, "{").replace(/%7D/gi, "}");
}
