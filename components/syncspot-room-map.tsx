"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, {
  AttributionControl,
  NavigationControl,
  type LngLatBoundsLike,
  type Map,
  type ResourceType,
  type StyleSpecification
} from "maplibre-gl";

type SyncSpotMapParticipant = {
  participantId: string;
  name: string;
  originLat: number | null;
  originLng: number | null;
  originLabel: string | null;
  confirmed: boolean;
};

type SyncSpotMapRecommendation = {
  poiId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  fairnessScore: number;
  maxTravelTime: number;
  minTravelTime: number;
  totalTravelTime: number;
  rank: number;
  perUserTravelTimes: Array<{
    participantId: string;
    name: string;
    profile?: "driving" | "motorcycle" | "tricycle" | "cycling" | "walking";
    duration: number;
    distance: number;
    geometry: string | null;
  }>;
};

type SyncSpotRoomMapProps = {
  participants: SyncSpotMapParticipant[];
  recommendations: SyncSpotMapRecommendation[];
  activeRecommendationIds: string[];
  onToggleRecommendation: (poiId: string) => void;
};

function proxiedGrabMapsUrl(url: string) {
  return new URL(
    `/api/grab-maps/resource?url=${encodeURIComponent(url)}`,
    window.location.origin
  ).toString();
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

const PARTICIPANT_COLORS = [
  "#0d8f73",
  "#2563eb",
  "#d97706",
  "#db2777"
];

function participantColor(participantId: string, participantIds: string[]) {
  const index = Math.max(participantIds.indexOf(participantId), 0);
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
}

export function SyncSpotRoomMap({
  participants,
  recommendations,
  activeRecommendationIds,
  onToggleRecommendation
}: SyncSpotRoomMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const hasAutoFittedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const confirmedParticipants = participants.filter(
    (participant) =>
      participant.confirmed &&
      participant.originLat !== null &&
      participant.originLng !== null
  );
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current) {
        return;
      }

      try {
        const response = await fetch("/api/grab-maps/style?theme=basic", {
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
          center: [103.8198, 1.3521],
          zoom: 11,
          pitch: 18,
          bearing: -8,
          transformRequest: (url: string, _resourceType?: ResourceType) => {
            if (url.startsWith("https://maps.grab.com")) {
              return { url: proxiedGrabMapsUrl(url) };
            }

            return { url };
          }
        });

        map.addControl(new NavigationControl(), "top-right");
        map.addControl(
          new AttributionControl({
            compact: false,
            customAttribution: "© Grab | © OpenStreetMap contributors"
          })
        );

        map.on("load", () => {
          if (cancelled) {
            return;
          }

          map.addSource("syncspot-participants", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: []
            }
          });

          map.addSource("syncspot-recommendations", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: []
            }
          });

          map.addSource("syncspot-routes", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: []
            }
          });

          map.addLayer({
            id: "syncspot-route-muted",
            type: "line",
            source: "syncspot-routes",
            filter: ["!=", ["get", "isActive"], true],
            layout: {
              "line-cap": "round",
              "line-join": "round"
            },
            paint: {
              "line-color": ["get", "color"],
              "line-opacity": 0.16,
              "line-width": 3
            }
          });

          map.addLayer({
            id: "syncspot-route-active",
            type: "line",
            source: "syncspot-routes",
            filter: ["==", ["get", "isActive"], true],
            layout: {
              "line-cap": "round",
              "line-join": "round"
            },
            paint: {
              "line-color": ["get", "color"],
              "line-opacity": 0.72,
              "line-width": 5
            }
          });

          map.addLayer({
            id: "syncspot-recommendation-points",
            type: "circle",
            source: "syncspot-recommendations",
            paint: {
              "circle-radius": [
                "case",
                ["==", ["get", "isActive"], true],
                8,
                6
              ],
              "circle-color": [
                "case",
                ["==", ["get", "isActive"], true],
                "#fffaf4",
                "#f5c451"
              ],
              "circle-stroke-color": [
                "case",
                ["==", ["get", "isActive"], true],
                "#0d8f73",
                "#fffaf4"
              ],
              "circle-stroke-width": [
                "case",
                ["==", ["get", "isActive"], true],
                3,
                2
              ],
              "circle-opacity": 0.96
            }
          });

          map.addLayer({
            id: "syncspot-participant-points",
            type: "circle",
            source: "syncspot-participants",
            paint: {
              "circle-radius": 8,
              "circle-color": ["get", "color"],
              "circle-stroke-color": "#fffaf4",
              "circle-stroke-width": 2
            }
          });

          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 16
          });

          map.on("mouseenter", "syncspot-recommendation-points", (event) => {
            map.getCanvas().style.cursor = "pointer";
            const feature = event.features?.[0];

            if (!feature || feature.geometry.type !== "Point") {
              return;
            }

            const properties = feature.properties as
              | {
                  name?: string;
                  address?: string;
                  score?: string;
                  worst?: string;
                  best?: string;
                  total?: string;
                  perUserSummary?: string;
                }
              | undefined;
            const [longitude, latitude] = feature.geometry.coordinates;
            const people =
              properties?.perUserSummary
                ?.split(" | ")
                .map((item) => `<div>${item}</div>`)
                .join("") ?? "";

            popupRef.current
              ?.setLngLat([longitude, latitude])
              .setHTML(
                `<div class="syncspot-map-popup">
                  <strong>${properties?.name ?? "Recommendation"}</strong>
                  <p>${properties?.address ?? ""}</p>
                  <div class="syncspot-map-popup-metrics">
                    <span>Score ${properties?.score ?? "-"}</span>
                    <span>Worst ${properties?.worst ?? "-"}</span>
                    <span>Best ${properties?.best ?? "-"}</span>
                    <span>Total ${properties?.total ?? "-"}</span>
                  </div>
                  <div class="syncspot-map-popup-users">${people}</div>
                </div>`
              )
              .addTo(map);
          });

          map.on("mouseleave", "syncspot-recommendation-points", () => {
            map.getCanvas().style.cursor = "";
            popupRef.current?.remove();
          });

          map.on("click", "syncspot-recommendation-points", (event) => {
            const feature = event.features?.[0];

            if (!feature || feature.geometry.type !== "Point") {
              return;
            }

            const poiId = feature.properties?.poiId;

            if (typeof poiId === "string") {
              onToggleRecommendation(poiId);
            }
          });

          setMapReady(true);
        });

        mapRef.current = map;
      } catch {
        setMapReady(false);
      }
    }

    void initMap();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    const participantIds = confirmedParticipants.map(
      (participant) => participant.participantId
    );

    const participantFeatures = confirmedParticipants.map((participant) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [participant.originLng ?? 0, participant.originLat ?? 0]
      },
      properties: {
        participantId: participant.participantId,
        name: participant.name,
        color: participantColor(participant.participantId, participantIds)
      }
    }));

    const recommendationFeatures = recommendations.map((recommendation) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [recommendation.lng, recommendation.lat]
      },
      properties: {
        poiId: recommendation.poiId,
        name: recommendation.name,
        address: recommendation.address ?? "",
        rank: recommendation.rank,
        score: recommendation.fairnessScore.toFixed(2),
        worst: `${Math.round(recommendation.maxTravelTime / 60)}m`,
        best: `${Math.round(recommendation.minTravelTime / 60)}m`,
        total: `${Math.round(recommendation.totalTravelTime / 60)}m`,
        perUserSummary: recommendation.perUserTravelTimes
          .map(
            (route) =>
              `${route.name} (${route.profile ?? "driving"}): ${Math.round(route.duration / 60)}m`
          )
          .join(" | "),
        isActive: activeRecommendationIds.includes(recommendation.poiId)
      }
    }));

    const routeFeatures = recommendations
      .filter((recommendation) => activeRecommendationIds.includes(recommendation.poiId))
      .flatMap((recommendation) =>
        recommendation.perUserTravelTimes
          .filter((route) => route.geometry)
          .map((route) => ({
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates: decodePolyline(route.geometry ?? "")
            },
            properties: {
              poiId: recommendation.poiId,
              participantId: route.participantId,
              color: participantColor(route.participantId, participantIds),
              isActive: true
            }
          }))
      );

    (
      map.getSource("syncspot-participants") as maplibregl.GeoJSONSource
    )?.setData({
      type: "FeatureCollection",
      features: participantFeatures
    });

    (
      map.getSource("syncspot-recommendations") as maplibregl.GeoJSONSource
    )?.setData({
      type: "FeatureCollection",
      features: recommendationFeatures
    });

    (map.getSource("syncspot-routes") as maplibregl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: routeFeatures
    });
  }, [activeRecommendationIds, confirmedParticipants, mapReady, recommendations]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady || hasAutoFittedRef.current) {
      return;
    }

    const seedRecommendations = recommendations.slice(0, 4);
    const boundsCoordinates: [number, number][] = [
      ...confirmedParticipants.map((participant) => [
        participant.originLng ?? 0,
        participant.originLat ?? 0
      ] as [number, number]),
      ...seedRecommendations.map((recommendation) => [
        recommendation.lng,
        recommendation.lat
      ] as [number, number])
    ];

    if (boundsCoordinates.length >= 2) {
      const bounds = boundsCoordinates.reduce(
        (accumulator, coordinate) =>
          accumulator.extend(coordinate),
        new maplibregl.LngLatBounds(boundsCoordinates[0], boundsCoordinates[0])
      );

      map.fitBounds(bounds as LngLatBoundsLike, {
        padding: 72,
        duration: 800
      });
      hasAutoFittedRef.current = true;
    }
  }, [confirmedParticipants, mapReady, recommendations]);

  return <div className="syncspot-map-backdrop" ref={containerRef} />;
}
