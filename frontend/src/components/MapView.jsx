import { MapContainer, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import maplibregl from "maplibre-gl";
import "@maplibre/maplibre-gl-leaflet";
import { useEffect, useMemo, useRef } from "react";
import { thumbUrl } from "../api.js";

if (typeof window !== "undefined") window.maplibregl = maplibregl;

// Layer-category → GL layer-id prefix map for VersaTiles/Shortbread styles.
const LAYER_GROUPS = {
  labels:    (id) => id.includes("label") || id.includes("name") || id.includes("text"),
  roads:     (id) => id.startsWith("road") || id.startsWith("path") || id.startsWith("track") || id.startsWith("bridge") || id.startsWith("tunnel"),
  buildings: (id) => id.startsWith("building"),
  transport: (id) => id.startsWith("rail") || id.startsWith("transit") || id.includes("airport") || id.includes("station"),
  nature:    (id) => id.startsWith("land") || id.startsWith("water") || id.startsWith("natural"),
};

function clusterIcon(cluster) {
  const img = cluster.cover_id
    ? `<img loading="lazy" src="${thumbUrl(cluster.cover_id)}" alt=""/>`
    : "";
  const badge =
    cluster.count > 1
      ? `<span class="cluster-badge">${cluster.count > 999 ? "999+" : cluster.count}</span>`
      : "";
  return L.divIcon({
    className: "mneme-cluster-marker",
    html: `<div class="cluster-wrap"><div class="cluster-thumb">${img}</div>${badge}</div>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
}

function BaseLayer({ style, layerVisibility }) {
  const map = useMap();
  const layerRef = useRef(null);
  const glRef = useRef(null);

  useEffect(() => {
    if (!style) return;
    let layer;
    let cleanup = () => {};
    if (style.type === "vector") {
      layer = L.maplibreGL({
        style: style.url,
        attribution: style.attribution || "&copy; OpenStreetMap contributors &middot; VersaTiles",
        localIdeographFontFamily: "sans-serif",
        padding: 1.0,
      });
      layer.addTo(map);
      const gl = layer.getMaplibreMap?.() || layer._glMap;
      glRef.current = gl;
      const refresh = () => {
        layerRef.current?._resizeContainer?.();
        layerRef.current?._update?.();
        gl?.resize?.();
        gl?.triggerRepaint?.();
      };
      gl?.once?.("load", refresh);
      map.on("zoomend", refresh);
      map.on("moveend", refresh);
      const ro = new ResizeObserver(refresh);
      ro.observe(map.getContainer());
      const t = setTimeout(refresh, 250);
      cleanup = () => { ro.disconnect(); clearTimeout(t); map.off("zoomend", refresh); map.off("moveend", refresh); };
    } else {
      glRef.current = null;
      layer = L.tileLayer(style.url, {
        attribution: style.attribution || "&copy; OpenStreetMap contributors",
        subdomains: style.subdomains ?? "abc",
        maxZoom: style.maxZoom ?? 19,
      });
      layer.addTo(map);
    }
    layerRef.current = layer;
    return () => { cleanup(); map.removeLayer(layer); layerRef.current = null; glRef.current = null; };
  }, [style?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply layer visibility toggles to the GL map whenever they change.
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !layerVisibility) return;
    const applyWhenReady = () => {
      if (!gl.isStyleLoaded()) return;
      const allLayers = gl.getStyle()?.layers ?? [];
      allLayers.forEach(({ id }) => {
        for (const [group, test] of Object.entries(LAYER_GROUPS)) {
          if (test(id)) {
            const vis = layerVisibility[group] !== false ? "visible" : "none";
            try { gl.setLayoutProperty(id, "visibility", vis); } catch {}
            break;
          }
        }
      });
    };
    if (gl.isStyleLoaded()) applyWhenReady();
    else gl.once("styledata", applyWhenReady);
  }, [layerVisibility]);

  return null;
}

function FitBounds({ points }) {
  const map = useMap();
  const hasFit = useRef(false);
  useEffect(() => {
    if (hasFit.current || !points.length) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
      hasFit.current = true;
    }
  }); // runs after every render but short-circuits after first successful fit
  return null;
}

function ViewTracker({ onViewChange }) {
  const map = useMap();
  const fire = () => {
    const b = map.getBounds();
    onViewChange(map.getZoom(), {
      minLat: b.getSouth(), maxLat: b.getNorth(),
      minLon: b.getWest(),  maxLon: b.getEast(),
    });
  };
  useMapEvents({ zoomend: fire, moveend: fire });
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], target.zoom ?? 12, { duration: 1.2 });
  }, [target?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function PlacementHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function MapView({ clusters, onClusterClick, mapStyle, layerVisibility, flyTo, onViewChange, placementMode, onMapClick, pendingPin }) {
  const markers = useMemo(
    () =>
      clusters.map((cluster) => {
        const label = [cluster.place, cluster.region, cluster.country]
          .filter(Boolean)
          .slice(0, 2)
          .join(", ");
        return (
          <Marker
            key={cluster.cluster_key}
            position={[cluster.lat, cluster.lon]}
            icon={clusterIcon(cluster)}
            eventHandlers={{ click: () => onClusterClick(cluster) }}
          >
            {label && (
              <Tooltip direction="top" offset={[0, -24]} opacity={0.95}>
                {label} &middot; {cluster.count} photo{cluster.count !== 1 ? "s" : ""}
              </Tooltip>
            )}
          </Marker>
        );
      }),
    [clusters, onClusterClick]
  );

  const pendingIcon = useMemo(() => L.divIcon({
    className: "pending-pin-marker",
    html: '<div class="pending-pin"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  }), []);

  return (
    <MapContainer
      center={[20, 0]} zoom={3} minZoom={1} maxZoom={19} worldCopyJump
      className={`map${placementMode ? " placement-mode" : ""}`}
    >
      <BaseLayer style={mapStyle} layerVisibility={layerVisibility} />
      {!placementMode && markers}
      {placementMode && onMapClick && <PlacementHandler onMapClick={onMapClick} />}
      {pendingPin && (
        <Marker position={[pendingPin.lat, pendingPin.lon]} icon={pendingIcon} />
      )}
      <FitBounds points={clusters} />
      <FlyTo target={flyTo} />
      {onViewChange && <ViewTracker onViewChange={onViewChange} />}
    </MapContainer>
  );
}
