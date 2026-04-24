"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import maplibregl, {
  AttributionControl,
  NavigationControl,
  type Map,
  type Marker,
  type ResourceType,
  type StyleSpecification
} from "maplibre-gl";

type GrabMapProps = {
  defaultCenter: [number, number];
  defaultZoom: number;
  defaultPlaygroundPath?: string;
  hasToken?: boolean;
  hasBaseUrl?: boolean;
};

type MapStatus = "idle" | "loading" | "ready" | "error";
type MapTheme = "basic" | "dark" | "satellite";
type PresetId = "singapore" | "manila" | "jakarta";
type PlacesMode = "keyword" | "nearby" | "reverse";
type RouteProfile = "driving" | "motorcycle" | "tricycle" | "cycling" | "walking";
type ActiveTab = "search" | "route" | "settings" | "api";

type Place = {
  poi_id?: string;
  id?: string;
  name?: string;
  short_name?: string;
  formatted_address?: string;
  category?: string;
  business_type?: string;
  distance?: number;
  location?: {
    latitude: number;
    longitude: number;
  };
};

type PlacesResponse = {
  error?: string;
  places?: Place[];
};

type RouteResponse = {
  error?: string;
  code?: string;
  waypoints?: Array<{
    location?: [number, number];
  }>;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: string;
    legs?: Array<{
      distance?: number;
      duration?: number;
    }>;
    traffic_light?: number;
  }>;
};

type RoutePoint = {
  id: string;
  kind: "start" | "via" | "end";
  latitude: number;
  longitude: number;
};

type MapConfig = {
  theme: MapTheme;
  interactive: boolean;
  navigation: boolean;
  attribution: boolean;
  buildings: boolean;
  labels: boolean;
  pitch: number;
  bearing: number;
  zoom: number;
  center: [number, number];
  preset: PresetId;
};

const PRESETS: Record<
  PresetId,
  { id: PresetId; label: string; center: [number, number]; zoom: number }
> = {
  singapore: {
    id: "singapore",
    label: "Singapore",
    center: [103.8198, 1.3521],
    zoom: 11
  },
  manila: {
    id: "manila",
    label: "Manila",
    center: [120.9842, 14.5995],
    zoom: 11
  },
  jakarta: {
    id: "jakarta",
    label: "Jakarta",
    center: [106.8456, -6.2088],
    zoom: 11
  }
};

const DEFAULT_CONFIG: MapConfig = {
  theme: "basic",
  interactive: true,
  navigation: true,
  attribution: true,
  buildings: true,
  labels: true,
  pitch: 0,
  bearing: 0,
  zoom: 11,
  center: PRESETS.singapore.center,
  preset: "singapore"
};

function proxiedGrabMapsUrl(url: string) {
  return new URL(
    `/api/grab-maps/resource?url=${encodeURIComponent(url)}`,
    window.location.origin
  ).toString();
}

function getLayerVisibility(enabled: boolean) {
  return enabled ? "visible" : "none";
}

function isLabelLayer(layerId: string) {
  return (
    layerId.includes("label") ||
    layerId.includes("place-") ||
    layerId.includes("poi-") ||
    layerId.includes("road-name") ||
    layerId.includes("transit-name") ||
    layerId.includes("water-name")
  );
}

function applyStyleOptions(map: Map, config: MapConfig) {
  const buildingVisibility = getLayerVisibility(config.buildings);
  const labelVisibility = getLayerVisibility(config.labels);

  for (const layer of map.getStyle().layers ?? []) {
    if (layer.id === "building" || layer.id === "building-top") {
      map.setLayoutProperty(layer.id, "visibility", buildingVisibility);
    }

    if (isLabelLayer(layer.id)) {
      map.setLayoutProperty(layer.id, "visibility", labelVisibility);
    }
  }
}

function toLocationString(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function formatDistance(distance?: number) {
  if (distance === undefined || Number.isNaN(distance)) {
    return null;
  }

  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }

  return `${distance.toFixed(2)} km`;
}

function getPlaceId(place: Place, index: number) {
  return place.poi_id ?? place.id ?? `${place.name ?? "place"}-${index}`;
}

function getPlaceLabel(place: Place) {
  return place.name ?? place.short_name ?? "Unnamed place";
}

function formatDuration(seconds?: number) {
  if (seconds === undefined || Number.isNaN(seconds)) {
    return null;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes} min`;
}

function decodePolyline(encoded: string, precision = 6): [number, number][] {
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates: [number, number][] = [];
  const factor = 10 ** precision;

  while (index < encoded.length) {
    let result = 1;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f);

    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f);

    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([longitude / factor, latitude / factor]);
  }

  return coordinates;
}

function setRouteOnMap(map: Map, encodedGeometry: string | null) {
  const routeSourceId = "grab-route-source";
  const routeLayerId = "grab-route-line";
  const routeGeoJson = encodedGeometry
    ? {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: decodePolyline(encodedGeometry)
        },
        properties: {}
      }
    : {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: []
        },
        properties: {}
      };

  const existingSource = map.getSource(routeSourceId) as
    | maplibregl.GeoJSONSource
    | undefined;

  if (existingSource) {
    existingSource.setData(routeGeoJson);
    return;
  }

  map.addSource(routeSourceId, {
    type: "geojson",
    data: routeGeoJson
  });

  map.addLayer({
    id: routeLayerId,
    type: "line",
    source: routeSourceId,
    layout: {
      "line-cap": "round",
      "line-join": "round"
    },
    paint: {
      "line-color": "#0d8f73",
      "line-width": 6,
      "line-opacity": 0.9
    }
  });
}

export function GrabMap({
  defaultCenter,
  defaultZoom,
  defaultPlaygroundPath,
  hasToken,
  hasBaseUrl
}: GrabMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const navigationControlRef = useRef<NavigationControl | null>(null);
  const attributionControlRef = useRef<AttributionControl | null>(null);
  const markerRefs = useRef<Marker[]>([]);

  const [status, setStatus] = useState<MapStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<Map | null>(null);
  const [config, setConfig] = useState<MapConfig>({
    ...DEFAULT_CONFIG,
    center: defaultCenter,
    zoom: defaultZoom
  });
  const [mapCenter, setMapCenter] = useState({
    latitude: defaultCenter[1],
    longitude: defaultCenter[0]
  });

  // Search state
  const [keyword, setKeyword] = useState("Marina Bay Sands");
  const [country, setCountry] = useState("SGP");
  const [limit, setLimit] = useState("5");
  const [nearbyRadius, setNearbyRadius] = useState("1");
  const [nearbyRankBy, setNearbyRankBy] = useState("distance");
  const [placesMode, setPlacesMode] = useState<PlacesMode>("keyword");
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [placesLoading, setPlacesLoading] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Route state
  const [routeProfile, setRouteProfile] = useState<RouteProfile>("driving");
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [routeLoading, setRouteLoading] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeSummary, setRouteSummary] = useState<{
    distance?: number;
    duration?: number;
    trafficLight?: number;
    legCount?: number;
  } | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([
    {
      id: "start",
      kind: "start",
      latitude: defaultCenter[1],
      longitude: defaultCenter[0]
    },
    {
      id: "end",
      kind: "end",
      latitude: 1.2921,
      longitude: 103.7767
    }
  ]);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  // Inline API playground state
  const [apiPath, setApiPath] = useState(defaultPlaygroundPath ?? "/");
  const [apiMethod, setApiMethod] = useState("GET");
  const [apiBody, setApiBody] = useState('{\n  "sample": true\n}');
  const [apiResponse, setApiResponse] = useState<Record<string, unknown> | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current) {
        return;
      }

      mapRef.current?.remove();
      mapRef.current = null;
      navigationControlRef.current = null;
      attributionControlRef.current = null;
      markerRefs.current = [];
      setMapInstance(null);

      setStatus("loading");
      setError(null);

      try {
        const response = await fetch(`/api/grab-maps/style?theme=${config.theme}`, {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error(`Unable to load GrabMaps style (HTTP ${response.status}).`);
        }

        const style = (await response.json()) as StyleSpecification;

        if (cancelled || !containerRef.current) {
          return;
        }

        const map = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: config.center,
          zoom: config.zoom,
          pitch: config.pitch,
          bearing: config.bearing,
          interactive: config.interactive,
          transformRequest: (url: string, _resourceType?: ResourceType) => {
            if (url.startsWith("https://maps.grab.com")) {
              return {
                url: proxiedGrabMapsUrl(url)
              };
            }

            return {
              url
            };
          }
        });

        if (config.navigation) {
          const navigationControl = new NavigationControl();
          map.addControl(navigationControl, "top-right");
          navigationControlRef.current = navigationControl;
        }

        if (config.attribution) {
          const attributionControl = new AttributionControl({
            compact: false,
            customAttribution: "© Grab | © OpenStreetMap contributors"
          });
          map.addControl(attributionControl);
          attributionControlRef.current = attributionControl;
        }

        map.on("load", () => {
          if (!cancelled) {
            applyStyleOptions(map, config);
            setRouteOnMap(map, null);
            setStatus("ready");
            setMapInstance(map);
          }
        });

        map.on("styledata", () => {
          if (!cancelled) {
            applyStyleOptions(map, config);
          }
        });

        map.on("moveend", () => {
          const center = map.getCenter();

          if (!cancelled) {
            setMapCenter({
              latitude: center.lat,
              longitude: center.lng
            });
          }
        });

        map.on("click", (event) => {
          if (!cancelled) {
            void runReverseGeo(event.lngLat.lat, event.lngLat.lng);
          }
        });

        map.on("error", (event) => {
          if (!cancelled) {
            setStatus("error");
            setError(event.error?.message ?? "Map failed to load.");
          }
        });

        mapRef.current = map;
      } catch (loadError) {
        if (!cancelled) {
          setStatus("error");
          setError(
            loadError instanceof Error ? loadError.message : "Map failed to initialize."
          );
        }
      }
    }

    initMap();

    return () => {
      cancelled = true;
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      navigationControlRef.current = null;
      attributionControlRef.current = null;
      setMapInstance(null);
    };
  }, [config]);

  useEffect(() => {
    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];

    if (!mapInstance) {
      return;
    }

    for (let index = 0; index < places.length; index += 1) {
      const place = places[index];

      if (!place.location) {
        continue;
      }

      const placeId = getPlaceId(place, index);
      const isSelected = placeId === selectedPlaceId;
      const marker = new maplibregl.Marker({
        color: isSelected ? "#0d8f73" : "#f97316"
      })
        .setLngLat([place.location.longitude, place.location.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 24 }).setHTML(
            `<strong>${getPlaceLabel(place)}</strong><br/>${place.formatted_address ?? ""}`
          )
        )
        .addTo(mapInstance);

      marker.getElement().addEventListener("click", () => {
        setSelectedPlaceId(placeId);
      });

      markerRefs.current.push(marker);
    }

    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
    };
  }, [mapInstance, places, selectedPlaceId]);

  useEffect(() => {
    if (places.length === 0) {
      return;
    }

    const selectedPlace =
      places.find((place, index) => getPlaceId(place, index) === selectedPlaceId) ??
      places[0];

    if (!selectedPlace?.location) {
      return;
    }

    const location = selectedPlace.location;

    setRoutePoints((current) =>
      current.map((point, index) =>
        index === current.length - 1
          ? {
              ...point,
              latitude: location.latitude,
              longitude: location.longitude
            }
          : point
      )
    );
  }, [places, selectedPlaceId]);

  function updateConfig<K extends keyof MapConfig>(key: K, value: MapConfig[K]) {
    setConfig((current) => ({
      ...current,
      [key]: value
    }));
  }

  function applyPreset(presetId: PresetId) {
    const preset = PRESETS[presetId];

    setConfig((current) => ({
      ...current,
      preset: preset.id,
      center: preset.center,
      zoom: preset.zoom
    }));
  }

  function resetScene() {
    setConfig({
      ...DEFAULT_CONFIG,
      center: defaultCenter,
      zoom: defaultZoom,
      preset: "singapore"
    });
  }

  function useMapCenterAsStart() {
    setRoutePoints((current) =>
      current.map((point, index) =>
        index === 0
          ? {
              ...point,
              latitude: mapCenter.latitude,
              longitude: mapCenter.longitude
            }
          : point
      )
    );
  }

  function useSelectedPlaceAsEnd() {
    const selectedPlace =
      places.find((place, index) => getPlaceId(place, index) === selectedPlaceId) ??
      places[0];

    if (!selectedPlace?.location) {
      setRouteError("Search or select a place before using it as the route destination.");
      return;
    }

    setRouteError(null);
    const location = selectedPlace.location;
    setRoutePoints((current) =>
      current.map((point, index) =>
        index === current.length - 1
          ? {
              ...point,
              latitude: location.latitude,
              longitude: location.longitude
            }
          : point
      )
    );
  }

  function addSelectedPlaceAsVia() {
    const selectedPlace =
      places.find((place, index) => getPlaceId(place, index) === selectedPlaceId) ??
      places[0];

    if (!selectedPlace?.location) {
      setRouteError("Search or select a place before adding it as a via point.");
      return;
    }

    setRouteError(null);
    setRoutePoints((current) => {
      const endPoint = current[current.length - 1];
      const viaPoint: RoutePoint = {
        id: `via-${Date.now()}`,
        kind: "via",
        latitude: selectedPlace.location!.latitude,
        longitude: selectedPlace.location!.longitude
      };

      return [...current.slice(0, -1), viaPoint, endPoint];
    });
  }

  function addBlankViaPoint() {
    setRoutePoints((current) => {
      const endPoint = current[current.length - 1];
      const viaPoint: RoutePoint = {
        id: `via-${Date.now()}`,
        kind: "via",
        latitude: mapCenter.latitude,
        longitude: mapCenter.longitude
      };

      return [...current.slice(0, -1), viaPoint, endPoint];
    });
  }

  function removeViaPoint(pointId: string) {
    setRoutePoints((current) => current.filter((point) => point.id !== pointId));
  }

  function updateRoutePoint(
    pointId: string,
    field: "latitude" | "longitude",
    value: number
  ) {
    setRoutePoints((current) =>
      current.map((point) =>
        point.id === pointId
          ? {
              ...point,
              [field]: value
            }
          : point
      )
    );
  }

  async function runKeywordSearch() {
    if (!keyword.trim()) {
      setPlacesError("Enter a keyword before searching.");
      return;
    }

    setPlacesLoading("Searching places...");
    setPlacesError(null);

    try {
      const params = new URLSearchParams({
        keyword: keyword.trim(),
        country: country.trim(),
        location: toLocationString(mapCenter.latitude, mapCenter.longitude),
        limit
      });
      const response = await fetch(`/api/grab-maps/places/search?${params}`, {
        cache: "no-store"
      });
      const data = (await response.json()) as PlacesResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Keyword search failed.");
      }

      setPlacesMode("keyword");
      setPlaces(data.places ?? []);
      setSelectedPlaceId(
        (data.places?.length ?? 0) > 0 ? getPlaceId(data.places![0], 0) : null
      );
    } catch (searchError) {
      setPlacesError(
        searchError instanceof Error ? searchError.message : "Keyword search failed."
      );
      setPlaces([]);
      setSelectedPlaceId(null);
    } finally {
      setPlacesLoading(null);
    }
  }

  async function runNearbySearch() {
    setPlacesLoading("Loading nearby places...");
    setPlacesError(null);

    try {
      const params = new URLSearchParams({
        location: toLocationString(mapCenter.latitude, mapCenter.longitude),
        radius: nearbyRadius,
        limit,
        rankBy: nearbyRankBy
      });
      const response = await fetch(`/api/grab-maps/places/nearby?${params}`, {
        cache: "no-store"
      });
      const data = (await response.json()) as PlacesResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Nearby search failed.");
      }

      setPlacesMode("nearby");
      setPlaces(data.places ?? []);
      setSelectedPlaceId(
        (data.places?.length ?? 0) > 0 ? getPlaceId(data.places![0], 0) : null
      );
    } catch (searchError) {
      setPlacesError(
        searchError instanceof Error ? searchError.message : "Nearby search failed."
      );
      setPlaces([]);
      setSelectedPlaceId(null);
    } finally {
      setPlacesLoading(null);
    }
  }

  async function runReverseGeo(latitude: number, longitude: number) {
    setPlacesLoading("Reverse geocoding...");
    setPlacesError(null);

    try {
      const params = new URLSearchParams({
        location: toLocationString(latitude, longitude)
      });
      const response = await fetch(`/api/grab-maps/places/reverse-geo?${params}`, {
        cache: "no-store"
      });
      const data = (await response.json()) as PlacesResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Reverse geocoding failed.");
      }

      setPlacesMode("reverse");
      setPlaces(data.places ?? []);
      setSelectedPlaceId(
        (data.places?.length ?? 0) > 0 ? getPlaceId(data.places![0], 0) : null
      );
    } catch (searchError) {
      setPlacesError(
        searchError instanceof Error ? searchError.message : "Reverse geocoding failed."
      );
      setPlaces([]);
      setSelectedPlaceId(null);
    } finally {
      setPlacesLoading(null);
    }
  }

  function focusPlace(place: Place, index: number) {
    if (!place.location || !mapInstance) {
      return;
    }

    setSelectedPlaceId(getPlaceId(place, index));
    mapInstance.flyTo({
      center: [place.location.longitude, place.location.latitude],
      zoom: Math.max(mapInstance.getZoom(), 14),
      essential: true
    });
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported in this browser.");
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      });

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      setMapCenter({ latitude, longitude });
      setConfig((current) => ({
        ...current,
        center: [longitude, latitude],
        zoom: Math.max(current.zoom, 14)
      }));
      setRoutePoints((current) =>
        current.map((point, index) =>
          index === 0
            ? {
                ...point,
                latitude,
                longitude
              }
            : point
        )
      );

      mapInstance?.flyTo({
        center: [longitude, latitude],
        zoom: Math.max(mapInstance.getZoom(), 14),
        essential: true
      });
    } catch (geolocationError) {
      const message =
        geolocationError instanceof Error
          ? geolocationError.message
          : typeof geolocationError === "object" &&
              geolocationError !== null &&
              "message" in geolocationError &&
              typeof geolocationError.message === "string"
            ? geolocationError.message
            : "Unable to get your current location.";

      setLocationError(message);
    } finally {
      setLocationLoading(false);
    }
  }

  async function runRoute() {
    setRouteLoading("Calculating route...");
    setRouteError(null);

    try {
      const params = new URLSearchParams();
      for (const point of routePoints) {
        params.append(
          "coordinates",
          `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`
        );
      }
      params.set("profile", routeProfile);
      params.set("overview", "full");

      const avoidValues = [
        avoidTolls ? "tolls" : null,
        avoidHighways ? "highways" : null
      ].filter(Boolean);

      if (avoidValues.length > 0) {
        params.set("avoid", avoidValues.join(","));
      }

      const response = await fetch(`/api/grab-maps/routes/direction?${params}`, {
        cache: "no-store"
      });
      const data = (await response.json()) as RouteResponse;

      if (!response.ok || data.code !== "ok") {
        throw new Error(data.error ?? "Route calculation failed.");
      }

      const route = data.routes?.[0];

      if (!route?.geometry) {
        throw new Error("No route geometry returned.");
      }

      setRouteSummary({
        distance: route.distance,
        duration: route.duration,
        trafficLight: route.traffic_light,
        legCount: route.legs?.length
      });

      if (mapInstance) {
        setRouteOnMap(mapInstance, route.geometry);
        const bounds = new maplibregl.LngLatBounds();

        for (const [lng, lat] of decodePolyline(route.geometry)) {
          bounds.extend([lng, lat]);
        }

        if (!bounds.isEmpty()) {
          mapInstance.fitBounds(bounds, {
            padding: 56,
            maxZoom: 15
          });
        }
      }
    } catch (routingError) {
      setRouteSummary(null);
      setRouteError(
        routingError instanceof Error ? routingError.message : "Route calculation failed."
      );
    } finally {
      setRouteLoading(null);
    }
  }

  async function submitApiRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiLoading(true);
    setApiError(null);
    setApiResponse(null);

    try {
      const parsedBody =
        apiMethod === "GET" ? undefined : apiBody.trim() ? JSON.parse(apiBody) : {};

      const result = await fetch("/api/grab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: apiPath, method: apiMethod, body: parsedBody })
      });

      const data = (await result.json()) as Record<string, unknown>;
      setApiResponse(data);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setApiLoading(false);
    }
  }

  return (
    <div className="map-app">
      {/* Full-screen map canvas */}
      <div className="map-canvas-full" ref={containerRef} />

      {/* Map loading / error overlay */}
      {status !== "ready" && (
        <div className="map-loading-overlay">
          <div className="map-loading-card">
            <strong>{status === "error" ? "Map error" : "Loading map…"}</strong>
            <span>
              {error ?? "Fetching style, tiles, and initializing the scene…"}
            </span>
          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <header className="topbar">
        <button
          className="menu-btn"
          onClick={() => setSidebarOpen((v) => !v)}
          type="button"
          aria-label="Toggle panel"
        >
          ☰
        </button>

        <span className="topbar-brand">GrabMaps</span>
        <div className="topbar-sep" />

        {/* City presets */}
        <div className="topbar-group">
          {Object.values(PRESETS).map((preset) => (
            <button
              key={preset.id}
              className={`chip-sm ${config.preset === preset.id ? "chip-sm-active" : ""}`}
              onClick={() => applyPreset(preset.id)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="topbar-spacer" />

        {/* Theme switcher */}
        <div className="topbar-group">
          {(["basic", "dark", "satellite"] as MapTheme[]).map((theme) => (
            <button
              key={theme}
              className={`chip-sm ${config.theme === theme ? "chip-sm-active" : ""}`}
              onClick={() => updateConfig("theme", theme)}
              type="button"
            >
              {theme}
            </button>
          ))}
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
        <nav className="sidebar-tabs">
          {(["search", "route", "settings", "api"] as const).map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? "tab-btn-active" : ""}`}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab === "search"
                ? "Search"
                : tab === "route"
                  ? "Route"
                  : tab === "settings"
                    ? "Settings"
                    : "API"}
            </button>
          ))}
        </nav>

        <div className="sidebar-body">
          {/* ── Search tab ── */}
          {activeTab === "search" && (
            <>
              <div className="field-group">
                <label className="field">
                  <span>Keyword</span>
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void runKeywordSearch();
                    }}
                    placeholder="Marina Bay Sands, cafe, hotel…"
                  />
                </label>

                <div className="field-row">
                  <label className="field">
                    <span>Country</span>
                    <input
                      maxLength={3}
                      value={country}
                      onChange={(e) => setCountry(e.target.value.toUpperCase())}
                      placeholder="SGP"
                    />
                  </label>
                  <label className="field">
                    <span>Limit</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                    />
                  </label>
                </div>

                <div className="field-row">
                  <label className="field">
                    <span>Nearby radius (km)</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={nearbyRadius}
                      onChange={(e) => setNearbyRadius(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Rank by</span>
                    <select
                      value={nearbyRankBy}
                      onChange={(e) => setNearbyRankBy(e.target.value)}
                    >
                      <option value="distance">Distance</option>
                      <option value="popularity">Popularity</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="action-row">
                <button
                  className="action-btn action-btn-primary"
                  onClick={() => void runKeywordSearch()}
                  type="button"
                >
                  Search
                </button>
                <button
                  className="action-btn"
                  onClick={() => void runNearbySearch()}
                  type="button"
                >
                  Nearby
                </button>
                <button
                  className="action-btn"
                  onClick={() => void useCurrentLocation()}
                  type="button"
                >
                  {locationLoading ? "Locating…" : "My location"}
                </button>
              </div>

              {locationError && <p className="error-text">{locationError}</p>}
              {placesError && <p className="error-text">{placesError}</p>}
              {placesLoading && <p className="status-text">{placesLoading}</p>}

              <div className="places-mode-bar">
                <span>{toLocationString(mapCenter.latitude, mapCenter.longitude)}</span>
                <span>{placesMode}</span>
              </div>

              <div className="results-list">
                {places.length === 0 ? (
                  <p className="empty-hint">
                    Search for places or click the map to reverse geocode a point.
                  </p>
                ) : (
                  places.map((place, index) => {
                    const placeId = getPlaceId(place, index);
                    const isSelected = placeId === selectedPlaceId;

                    return (
                      <button
                        className={`place-item ${isSelected ? "place-item-active" : ""}`}
                        key={placeId}
                        onClick={() => focusPlace(place, index)}
                        type="button"
                      >
                        <strong>{getPlaceLabel(place)}</strong>
                        <span>{place.formatted_address ?? "No address"}</span>
                        <span>
                          {[
                            place.business_type,
                            place.category,
                            formatDistance(place.distance)
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* ── Route tab ── */}
          {activeTab === "route" && (
            <>
              <div className="field-group">
                <p className="section-label">Route points</p>
                <div className="route-points-list">
                  {routePoints.map((point, index) => (
                    <div className="route-point-card" key={point.id}>
                      <div className="route-point-header">
                        <strong>
                          {point.kind === "start"
                            ? "Start"
                            : point.kind === "end"
                              ? "Destination"
                              : `Via point ${index}`}
                        </strong>
                        {point.kind === "via" ? (
                          <button
                            className="route-point-remove"
                            onClick={() => removeViaPoint(point.id)}
                            type="button"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>

                      <div className="field-row">
                        <label className="field">
                          <span>Latitude</span>
                          <input
                            type="number"
                            step="0.000001"
                            value={point.latitude}
                            onChange={(e) =>
                              updateRoutePoint(
                                point.id,
                                "latitude",
                                Number(e.target.value)
                              )
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Longitude</span>
                          <input
                            type="number"
                            step="0.000001"
                            value={point.longitude}
                            onChange={(e) =>
                              updateRoutePoint(
                                point.id,
                                "longitude",
                                Number(e.target.value)
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="action-row">
                  <button className="action-btn" onClick={useMapCenterAsStart} type="button">
                    Start from map center
                  </button>
                  <button
                    className="action-btn"
                    onClick={() => void useCurrentLocation()}
                    type="button"
                  >
                    My location
                  </button>
                  <button
                    className="action-btn"
                    onClick={useSelectedPlaceAsEnd}
                    type="button"
                  >
                    End at selected place
                  </button>
                  <button className="action-btn" onClick={addBlankViaPoint} type="button">
                    Add via point
                  </button>
                  <button
                    className="action-btn"
                    onClick={addSelectedPlaceAsVia}
                    type="button"
                  >
                    Add selected place as via
                  </button>
                </div>
              </div>

              <div className="field-group">
                <label className="field">
                  <span>Transport profile</span>
                  <select
                    value={routeProfile}
                    onChange={(e) => setRouteProfile(e.target.value as RouteProfile)}
                  >
                    <option value="driving">Driving</option>
                    <option value="motorcycle">Motorcycle</option>
                    <option value="tricycle">Tricycle</option>
                    <option value="cycling">Cycling</option>
                    <option value="walking">Walking</option>
                  </select>
                </label>
                <div className="toggle-row">
                  <label className="toggle-inline">
                    <input
                      type="checkbox"
                      checked={avoidTolls}
                      onChange={(e) => setAvoidTolls(e.target.checked)}
                    />
                    <span>Avoid tolls</span>
                  </label>
                  <label className="toggle-inline">
                    <input
                      type="checkbox"
                      checked={avoidHighways}
                      onChange={(e) => setAvoidHighways(e.target.checked)}
                    />
                    <span>Avoid highways</span>
                  </label>
                </div>
              </div>

              <button
                className="action-btn action-btn-primary action-btn-full"
                onClick={() => void runRoute()}
                type="button"
              >
                {routeLoading ? "Calculating…" : "Calculate route"}
              </button>

              {routeError && <p className="error-text">{routeError}</p>}
              {routeLoading && <p className="status-text">{routeLoading}</p>}

              {routeSummary && (
                <div className="summary-grid">
                  <div className="summary-tile">
                    <span>Distance</span>
                    <strong>
                      {formatDistance(
                        routeSummary.distance ? routeSummary.distance / 1000 : undefined
                      ) ?? "—"}
                    </strong>
                  </div>
                  <div className="summary-tile">
                    <span>ETA</span>
                    <strong>{formatDuration(routeSummary.duration) ?? "—"}</strong>
                  </div>
                  <div className="summary-tile">
                    <span>Lights</span>
                    <strong>{routeSummary.trafficLight ?? 0}</strong>
                  </div>
                  <div className="summary-tile">
                    <span>Legs</span>
                    <strong>{routeSummary.legCount ?? 0}</strong>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Settings tab ── */}
          {activeTab === "settings" && (
            <>
              <div className="field-group">
                <p className="section-label">Layers</p>
                <div className="toggle-list">
                  {(
                    [
                      ["interactive", "Interactive"],
                      ["navigation", "Navigation controls"],
                      ["attribution", "Attribution"],
                      ["buildings", "Buildings"],
                      ["labels", "Labels"]
                    ] as [keyof MapConfig, string][]
                  ).map(([key, label]) => (
                    <label className="toggle-row-item" key={key}>
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={config[key] as boolean}
                        onChange={(e) =>
                          updateConfig(key, e.target.checked as never)
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="field-group">
                <p className="section-label">Camera</p>
                {(
                  [
                    {
                      key: "zoom" as const,
                      label: "Zoom",
                      min: 3,
                      max: 18,
                      step: 0.5,
                      fmt: (v: number) => v.toFixed(1)
                    },
                    {
                      key: "pitch" as const,
                      label: "Pitch",
                      min: 0,
                      max: 60,
                      step: 1,
                      fmt: (v: number) => `${v}°`
                    },
                    {
                      key: "bearing" as const,
                      label: "Bearing",
                      min: -180,
                      max: 180,
                      step: 5,
                      fmt: (v: number) => `${v}°`
                    }
                  ] as const
                ).map(({ key, label, min, max, step, fmt }) => (
                  <label className="slider-item" key={key}>
                    <div className="slider-header">
                      <span>{label}</span>
                      <strong>{fmt(config[key] as number)}</strong>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={config[key] as number}
                      onChange={(e) =>
                        updateConfig(key, Number(e.target.value) as never)
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="action-row">
                <button
                  className="action-btn"
                  onClick={() => updateConfig("pitch", 45)}
                  type="button"
                >
                  Hero pitch
                </button>
                <button
                  className="action-btn"
                  onClick={() => updateConfig("bearing", 0)}
                  type="button"
                >
                  Reset bearing
                </button>
                <button className="action-btn" onClick={resetScene} type="button">
                  Reset all
                </button>
              </div>

              {(hasToken !== undefined || hasBaseUrl !== undefined) && (
                <div className="field-group">
                  <p className="section-label">Config status</p>
                  <div className="toggle-list">
                    <div className="toggle-row-item">
                      <span>API key</span>
                      <span
                        className={`status-badge ${hasToken ? "status-badge-ok" : "status-badge-err"}`}
                      >
                        {hasToken ? "Configured" : "Missing"}
                      </span>
                    </div>
                    <div className="toggle-row-item">
                      <span>Base URL</span>
                      <span className="status-badge status-badge-ok">
                        {hasBaseUrl ? "Configured" : "Default"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── API tab ── */}
          {activeTab === "api" && (
            <form
              className="playground-compact"
              onSubmit={(e) => void submitApiRequest(e)}
            >
              <label>
                <span>Method</span>
                <select value={apiMethod} onChange={(e) => setApiMethod(e.target.value)}>
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                  <option>DELETE</option>
                </select>
              </label>

              <label>
                <span>Grab path</span>
                <input
                  value={apiPath}
                  onChange={(e) => setApiPath(e.target.value)}
                  placeholder="/v1/your-endpoint"
                  spellCheck={false}
                />
              </label>

              <label>
                <span>JSON body</span>
                <textarea
                  value={apiBody}
                  onChange={(e) => setApiBody(e.target.value)}
                  spellCheck={false}
                  disabled={apiMethod === "GET"}
                />
              </label>

              <button className="submit-btn" type="submit" disabled={apiLoading}>
                {apiLoading ? "Sending…" : "Send via backend"}
              </button>

              {apiError && <p className="error-text">{apiError}</p>}

              {apiResponse !== null && (
                <div className="playground-response">
                  <div className="playground-response-header">
                    <strong>Response</strong>
                    <span>
                      {apiResponse.status ? `HTTP ${apiResponse.status}` : "OK"}
                    </span>
                  </div>
                  <pre>{JSON.stringify(apiResponse, null, 2)}</pre>
                </div>
              )}
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}
