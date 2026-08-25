"use client";

import { BountiesTable } from "@/components/BountiesTable";
import { FacilityMap } from "@/components/FacilityMap";
import styles from "./CommunityPulse.module.css";

export function CommunityPulse() {
  return (
    <section id="community-pulse" className={styles.section} aria-labelledby="community-pulse-heading">
      <div className={styles.container}>
        <h2 id="community-pulse-heading" className={styles.heading}>
          Community Pulse
        </h2>
        
        <div className={styles.grid}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Open Bounties</h3>
            <div className={styles.tableWrapper}>
              <BountiesTable />
            </div>
          </div>
          
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Facility Map</h3>
            <div className={styles.mapWrapper}>
              <FacilityMap />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
