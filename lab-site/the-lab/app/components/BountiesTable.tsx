"use client";

import { useBounties } from "@/hooks/useBounties";
import styles from "./BountiesTable.module.css";

export function BountiesTable() {
  const { bounties, isLoading, error } = useBounties();

  if (isLoading) {
    return <div className={styles.loading}>Loading bounties…</div>;
  }

  if (error) {
    return <div className={styles.error} role="alert">Failed to load bounties.</div>;
  }

  if (!bounties.length) {
    return <div className={styles.empty}>No open bounties at this time.</div>;
  }

  return (
    <table className={styles.table} role="table">
      <thead>
        <tr>
          <th scope="col">Title</th>
          <th scope="col">Reward</th>
          <th scope="col">Status</th>
          <th scope="col">Expires</th>
        </tr>
      </thead>
      <tbody>
        {bounties.map((bounty) => (
          <tr key={bounty.id}>
            <td className={styles.titleCell}>
              <a href={bounty.url} className={styles.titleLink} target="_blank" rel="noopener noreferrer">
                {bounty.title}
              </a>
            </td>
            <td className={styles.rewardCell}>{bounty.reward}</td>
            <td>
              <span className={`${styles.badge} ${styles[bounty.status]}`}>{bounty.status}</span>
            </td>
            <td className={styles.dateCell}>{bounty.expiresAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
