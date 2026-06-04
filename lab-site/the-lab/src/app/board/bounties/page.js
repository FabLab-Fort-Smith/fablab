"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import QRCode from "react-qr-code";

export default function BoardBountiesPage() {
    const [bounties, setBounties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [baseUrl, setBaseUrl] = useState('');
    const [selectedBounty, setSelectedBounty] = useState(null);

    useEffect(() => {
        setBaseUrl(window.location.origin);
        const fetchBounties = async () => {
            try {
                const res = await fetch('/api/v1/bounties');
                if (res.ok) {
                    const data = await res.json();
                    setBounties((data.bounties || []).filter(b => b.status === 'open'));
                }
            } catch (error) { console.error("Failed to fetch bounties", error); }
            finally { setLoading(false); }
        };

        fetchBounties();
        const interval = setInterval(fetchBounties, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg)' }}>
            <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 13 }}>loading<span style={{ animation: 'blink 1s step-end infinite' }}>_</span></div>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24 }}>
            <div style={{ maxWidth: 480, margin: '0 auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32, position: 'relative' }}>
                    <Link href="/board" style={{ position: 'absolute', left: 0, textDecoration: 'none' }}>
                        <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }}>← back</button>
                    </Link>
                    <div style={{ width: '100%', textAlign: 'center', fontFamily: 'var(--display)', fontSize: '1.8rem', letterSpacing: '-0.04em', color: 'var(--text-bright)' }}>bounties</div>
                </div>

                {/* Bounty List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <AnimatePresence>
                        {bounties.map((bounty, index) => (
                            <motion.div
                                key={bounty._id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                layout
                                style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', cursor: 'pointer' }}
                                onClick={() => setSelectedBounty(bounty)}
                            >
                                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div style={{ width: 44, height: 44, border: `1px solid ${bounty.rewardType === 'hours' ? 'var(--cyan)' : 'var(--green)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>
                                        {bounty.rewardType === 'hours' ? '⏱' : '◈'}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ color: 'var(--text-bright)', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>{bounty.title}</div>
                                        <div style={{ color: 'var(--text-mid)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6 }}>{bounty.description}</div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: bounty.rewardType === 'hours' ? 'var(--cyan)' : 'var(--green)', border: `1px solid ${bounty.rewardType === 'hours' ? 'var(--cyan)' : 'var(--green)'}`, padding: '2px 8px' }}>
                                                {bounty.rewardType === 'hours' ? `${bounty.rewardValue} Hrs` : bounty.rewardValue}
                                            </span>
                                            {bounty.stakeValue > 0 && (
                                                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', border: '1px solid var(--amber)', padding: '2px 8px' }}>+{bounty.stakeValue} ★</span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ color: 'var(--text-dim)', fontSize: 16 }}>›</div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {bounties.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-dim)' }}>
                            <div style={{ fontSize: 16, marginBottom: 8, color: 'var(--text-mid)' }}>All caught up!</div>
                            <div style={{ fontSize: 13 }}>No active bounties right now.</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Detail Modal */}
            {selectedBounty && (
                <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 9999, display: 'flex', flexDirection: 'column', padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                        <button onClick={() => setSelectedBounty(null)} style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', color: 'var(--text-mid)', cursor: 'pointer', width: 40, height: 40, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 4vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 8 }}>{selectedBounty.title}</div>

                        <div style={{ display: 'flex', gap: 10, marginBottom: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: selectedBounty.rewardType === 'hours' ? 'var(--cyan)' : 'var(--green)', border: `1px solid ${selectedBounty.rewardType === 'hours' ? 'var(--cyan)' : 'var(--green)'}`, padding: '4px 12px' }}>
                                {selectedBounty.rewardType === 'hours' ? `${selectedBounty.rewardValue} Hours` : selectedBounty.rewardValue}
                            </span>
                            {selectedBounty.recurrence && selectedBounty.recurrence !== 'none' && (
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-mid)', border: '1px solid var(--bd)', padding: '4px 12px' }}>↻ {selectedBounty.recurrence}</span>
                            )}
                        </div>

                        <div style={{ background: 'white', padding: 20, marginBottom: 24 }}>
                            <QRCode value={`${baseUrl}/dashboard/activities/bounties?highlight=${selectedBounty.bountyID}`} size={200} />
                        </div>

                        <div style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '0.12em', marginBottom: 16 }}>SCAN TO CLAIM</div>

                        <div style={{ color: 'var(--text-mid)', fontSize: 14, maxWidth: 400, lineHeight: 1.6 }}>{selectedBounty.description}</div>
                    </div>
                </div>
            )}
        </div>
    );
}
