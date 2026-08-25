"use client";

import { useEffect, useRef } from "react";
import styles from "./FacilityMap.module.css";

export function FacilityMap() {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current || (window as any).mapInitialized) return;

    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapRef.current, {
      center: [35.3859, -94.4280],
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    L.marker([35.3859, -94.4280]).addTo(map)
      .bindPopup("FabLab Fort Smith")
      .openPopup();

    (window as any).mapInitialized = true;

    return () => {
      map.remove();
      (window as any).mapInitialized = false;
    };
  }, []);

  return <div ref={mapRef} className={styles.mapContainer} role="application" aria-label="FabLab facility map" />;
}
