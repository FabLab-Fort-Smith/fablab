import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const ArcadeLeaderboard = ({ refreshTrigger }) => {
    const [scores, setScores] = useState([]);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const res = await fetch('/api/v1/arcade/leaderboard?game=infinite_loop');
                const data = await res.json();
                if (Array.isArray(data)) setScores(data);
            } catch (error) {
                console.error("Failed to fetch leaderboard", error);
            }
        };

        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 60000);
        return () => clearInterval(interval);
    }, [refreshTrigger]);

    const RANK_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

    return (
        <div style={{ padding: 16, background: 'rgba(0,0,0,0.5)', border: '1px solid #333' }}>
            <div style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                ★ TOP HACKERS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {scores.slice(0, 3).map((score, index) => (
                    <div key={score._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: index < Math.min(scores.length, 3) - 1 ? '1px solid #333' : 'none' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: score.avatar ? `url(${score.avatar}) center/cover` : '#222', border: `2px solid ${RANK_COLORS[index] || '#333'}`, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: '#fff', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {index + 1}. {score.username}
                            </div>
                            <div style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 11 }}>{score.score} PTS</div>
                        </div>
                    </div>
                ))}
                {scores.length === 0 && (
                    <div style={{ color: '#666', textAlign: 'center', padding: '16px 0', fontFamily: 'var(--mono)', fontSize: 12 }}>No scores yet. Be the first!</div>
                )}
            </div>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Link href="/dashboard/activities/leaderboard">
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10, color: 'var(--green)', borderColor: 'var(--green)', width: '100%' }}>
                        VIEW FULL LEADERBOARD
                    </button>
                </Link>
            </div>
        </div>
    );
};

export default ArcadeLeaderboard;
