"use client";

import { useEffect, useRef } from "react";
import maplibregl, {
  AttributionControl,
  NavigationControl,
  type Map,
  type ResourceType,
  type StyleSpecification
} from "maplibre-gl";

function proxiedGrabMapsUrl(url: string) {
  return new URL(
    `/api/grab-maps/resource?url=${encodeURIComponent(url)}`,
    window.location.origin
  ).toString();
}

const CAMERA_STOPS = [
  {
    center: [103.8198, 1.3521] as [number, number],
    zoom: 10.7,
    pitch: 50,
    bearing: -18
  },
  {
    center: [103.8615, 1.3098] as [number, number],
    zoom: 11.2,
    pitch: 56,
    bearing: 18
  },
  {
    center: [103.7924, 1.3338] as [number, number],
    zoom: 10.9,
    pitch: 52,
    bearing: 46
  },
  {
    center: [103.8842, 1.3574] as [number, number],
    zoom: 11.1,
    pitch: 58,
    bearing: 88
  }
];

export function SyncSpotHomeMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    async function initMap() {
      if (!containerRef.current) {
        return;
      }

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

      const firstStop = CAMERA_STOPS[0];
      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: firstStop.center,
        zoom: firstStop.zoom,
        pitch: firstStop.pitch,
        bearing: firstStop.bearing,
        interactive: false,
        transformRequest: (url: string, _resourceType?: ResourceType) => {
          if (url.startsWith("https://maps.grab.com")) {
            return { url: proxiedGrabMapsUrl(url) };
          }

          return { url };
        }
      });

      map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(
        new AttributionControl({
          compact: true,
          customAttribution: "© Grab | © OpenStreetMap contributors"
        })
      );

      map.on("load", () => {
        let stopIndex = 0;

        intervalId = window.setInterval(() => {
          if (cancelled) {
            return;
          }

          stopIndex = (stopIndex + 1) % CAMERA_STOPS.length;
          const nextStop = CAMERA_STOPS[stopIndex];

          map.easeTo({
            center: nextStop.center,
            zoom: nextStop.zoom,
            pitch: nextStop.pitch,
            bearing: nextStop.bearing,
            duration: 5200,
            essential: true
          });
        }, 4200);
      });

      mapRef.current = map;
    }

    void initMap().catch(() => {
      // Keep the landing page usable even if the map style is temporarily unavailable.
    });

    return () => {
      cancelled = true;

      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }

      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="syncspot-home-backdrop" aria-hidden="true">
      <div className="syncspot-home-map" ref={containerRef} />
      <div className="syncspot-home-glow" />
    </div>
  );
}
