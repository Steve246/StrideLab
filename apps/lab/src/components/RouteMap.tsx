"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lon: number };

/** GPS track on an OpenStreetMap basemap. */
export function RouteMap({ points }: { points: Point[] }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || points.length < 2) return;
    let map: { remove: () => void } | null = null;
    let cancelled = false;

    void (async () => {
      const mod = await import("leaflet");
      const L = mod.default ?? mod;
      if (cancelled || !host.current) return;
      const view = L.map(host.current, { zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 18,
      }).addTo(view);
      const line = points.map((p) => [p.lat, p.lon] as [number, number]);
      const route = L.polyline(line, { color: "#1d6f5a", weight: 4 }).addTo(view);
      L.circleMarker(line[0]!, { radius: 6, color: "#0f172a", fillOpacity: 1 }).addTo(view);
      L.circleMarker(line[line.length - 1]!, {
        radius: 6,
        color: "#c47f17",
        fillOpacity: 1,
      }).addTo(view);
      view.fitBounds(route.getBounds(), { padding: [24, 24] });
      if (cancelled) {
        view.remove();
        return;
      }
      map = view;
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points]);

  if (points.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        No GPS track for this activity. A connected Personal API key loads the
        route from Garmin.
      </p>
    );
  }

  return (
    <div className="route-map overflow-hidden border border-border/80">
      <div ref={host} className="h-80 w-full" />
      <p className="px-2 py-1 text-[11px] text-muted-foreground">
        Map data © OpenStreetMap. Dark dot is the start, amber is the finish.
      </p>
    </div>
  );
}
