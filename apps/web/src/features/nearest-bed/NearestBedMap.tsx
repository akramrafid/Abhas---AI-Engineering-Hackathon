"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { Lang } from "@/lib/i18n";
import type { HospitalRecord } from "./api";
import type { RankedHospitalItem } from "./ranking";

export interface NearestBedMapProps {
  ranked: readonly RankedHospitalItem<HospitalRecord>[];
  userLat: number;
  userLon: number;
  selectedHospitalId: string | null;
  onSelectHospital: (id: string) => void;
  offline: boolean;
  attribution: string;
  lang: Lang;
}

function isOfflineEnv(): boolean {
  return (
    process.env.NEXT_PUBLIC_ABHAS_OFFLINE === "1" ||
    process.env.NEXT_PUBLIC_ABHAS_OFFLINE === "true"
  );
}

function buildStyle(
  offlineMode: boolean,
  hospitalsGeoJson: GeoJSON.FeatureCollection,
  userGeoJson: GeoJSON.FeatureCollection,
): StyleSpecification {
  const sources: StyleSpecification["sources"] = {
    hospitals: {
      type: "geojson",
      data: hospitalsGeoJson,
    },
    userPoint: {
      type: "geojson",
      data: userGeoJson,
    },
  };

  const layers: StyleSpecification["layers"] = [
    {
      id: "bg",
      type: "background",
      paint: { "background-color": offlineMode ? "#EEF3FA" : "#F8FAFC" },
    },
  ];

  if (!offlineMode) {
    sources.osmTiles = {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors · ODbL 1.0",
    };
    layers.push({
      id: "osm-raster",
      type: "raster",
      source: "osmTiles",
      paint: { "raster-opacity": 0.88 },
    });
  }

  layers.push(
    {
      id: "hospital-circles",
      type: "circle",
      source: "hospitals",
      paint: {
        "circle-radius": [
          "case",
          ["boolean", ["get", "selected"], false],
          10,
          ["==", ["get", "rank"], 1],
          9,
          6.5,
        ],
        "circle-color": [
          "match",
          ["get", "rankTier"],
          1,
          "#0F766E",
          2,
          "#B45309",
          "#991B1B",
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#FFFFFF",
      },
    },
    {
      id: "user-pin",
      type: "circle",
      source: "userPoint",
      paint: {
        "circle-radius": 7,
        "circle-color": "#2F5BFF",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#FFFFFF",
      },
    },
  );

  return {
    version: 8,
    sources,
    layers,
  };
}

export function NearestBedMap({
  ranked,
  userLat,
  userLon,
  selectedHospitalId,
  onSelectHospital,
  offline,
  attribution,
  lang,
}: NearestBedMapProps) {
  const bn = lang === "bn";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const offlineMode = offline || isOfflineEnv();

  const hospitalsGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: ranked.map((item, idx) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [item.hospital.lon, item.hospital.lat],
        },
        properties: {
          id: item.hospital.id,
          name: item.hospital.name,
          rank: idx + 1,
          rankTier: item.rankTier,
          selected: item.hospital.id === selectedHospitalId,
        },
      })),
    }),
    [ranked, selectedHospitalId],
  );

  const userGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [userLon, userLat],
          },
          properties: { label: "Reference" },
        },
      ],
    }),
    [userLat, userLon],
  );

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) return;

    void (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: buildStyle(offlineMode, hospitalsGeoJson, userGeoJson),
          center: [userLon, userLat],
          zoom: 11.4,
          attributionControl: false,
        });
        map.on("click", "hospital-circles", (evt) => {
          const feat = evt.features?.[0];
          const id = feat?.properties?.id;
          if (typeof id === "string") {
            onSelectHospital(id);
          }
        });
        mapRef.current = map;
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // Recreate map only when offline/online style mode changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyData = () => {
      const hSrc = map.getSource("hospitals") as
        | { setData?: (d: GeoJSON.FeatureCollection) => void }
        | undefined;
      const uSrc = map.getSource("userPoint") as
        | { setData?: (d: GeoJSON.FeatureCollection) => void }
        | undefined;
      hSrc?.setData?.(hospitalsGeoJson);
      uSrc?.setData?.(userGeoJson);
      map.easeTo({ center: [userLon, userLat], duration: 350 });
    };
    if (map.isStyleLoaded()) {
      applyData();
    } else {
      map.once("load", applyData);
    }
  }, [hospitalsGeoJson, userGeoJson, userLat, userLon]);

  return (
    <div
      data-testid="nearest-bed-map-card"
      className="overflow-hidden rounded-2xl border border-mist/90 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mist/80 bg-paper px-4 py-2.5 text-xs">
        <span className="font-semibold text-navy">
          {offlineMode
            ? bn
              ? "অফলাইন লোকাল GeoJSON মানচিত্র (কোনো এক্সটার্নাল টাইল নয়)"
              : "Offline GeoJSON-only map (zero external tiles)"
            : bn
              ? "হাসপাতাল মানচিত্র (OpenStreetMap টাইল)"
              : "Hospital map (OpenStreetMap tiles)"}
        </span>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-slate">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#0F766E]" />
            {bn ? "তাজা খালি" : "Fresh open"}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#B45309]" />
            {bn ? "পুরোনো (>৬ ঘ.)" : "Stale (>6 h)"}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#991B1B]" />
            {bn ? "পূর্ণ" : "Full"}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#2F5BFF]" />
            {bn ? "আপনার অবস্থান" : "Reference"}
          </span>
        </div>
      </div>

      {mapFailed ? (
        <div
          data-testid="nearest-bed-map-fallback"
          className="flex h-56 items-center justify-center bg-paper p-4 text-center text-xs text-slate"
        >
          {bn
            ? "WebGL অনুপলব্ধ — নিচের তালিকাটি সম্পূর্ণ অফলাইনে স্থানীয় GeoJSON থেকে র‍্যাঙ্ক করা হয়েছে।"
            : "Map canvas unavailable — hospital rankings below are computed locally from the offline GeoJSON snapshot."}
        </div>
      ) : (
        <div
          ref={containerRef}
          data-testid="nearest-bed-map-canvas"
          className="h-64 w-full sm:h-72"
          aria-label={
            bn ? "নিকটতম হাসপাতালের মানচিত্র" : "Nearest hospital locations map"
          }
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-mist/80 bg-white px-4 py-2 font-mono text-[11px] text-slate">
        <span>{attribution}</span>
        <span>
          {bn
            ? "সরলরেখার দূরত্ব · আনুমানিক সময় (estimate)"
            : "Straight-line Haversine distance · ETA estimate"}
        </span>
      </div>
    </div>
  );
}
