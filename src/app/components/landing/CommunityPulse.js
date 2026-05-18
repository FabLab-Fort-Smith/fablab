"use client";

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

const ActivityCard = ({ title, description, tags }) => (
    <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((tag, i) => (
                <span key={i} style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '2px 8px', letterSpacing: '0.08em' }}>{tag}</span>
            ))}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-bright)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3 }}>{description}</div>
    </div>
);

const SkeletonCard = () => (
    <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '20px', height: 160, boxSizing: 'border-box' }}>
        <div style={{ height: 10, width: '40%', background: 'var(--bg-1)', marginBottom: 12 }} />
        <div style={{ height: 14, width: '75%', background: 'var(--bg-1)', marginBottom: 8 }} />
        <div style={{ height: 10, width: '90%', background: 'var(--bg-1)', marginBottom: 6 }} />
        <div style={{ height: 10, width: '60%', background: 'var(--bg-1)' }} />
    </div>
);

const EmptyState = ({ label }) => (
    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '32px 0', fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)', border: '1px solid var(--bd)', background: 'var(--bg-card)' }}>
        No {label} to display right now.
    </div>
);

const CommunityPulse = () => {
    const [bounties, setBounties] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [bountiesRes, projectsRes] = await Promise.all([
                    fetch('/api/v1/bounties?status=open&limit=3'),
                    fetch('/api/v1/portfolio?limit=3&sort=latest')
                ]);

                if (bountiesRes.ok) {
                    const data = await bountiesRes.json();
                    if (data.bounties && data.bounties.length > 0) {
                        setBounties(data.bounties.map(b => ({
                            title: b.title,
                            description: b.description,
                            tags: ['Bounty', `${b.stakeValue} Stake`, b.rewardType === 'cash' ? '$$$' : 'Hours'],
                        })));
                    }
                }

                if (projectsRes.ok) {
                    const data = await projectsRes.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setProjects(data.map(p => ({
                            title: p.title,
                            description: p.description,
                            tags: ['Showcase'],
                        })));
                    }
                }
            } catch (error) {
                console.error("Failed to fetch community pulse data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const sectionHeader = (icon, title, subtitle) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span style={{ fontSize: 20, color: 'var(--green)' }}>{icon}</span>
            <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '1.3rem', letterSpacing: '-0.04em', color: 'var(--text-bright)' }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>{subtitle}</div>
            </div>
        </div>
    );

    return (
        <div style={{ padding: '64px 32px', background: 'var(--bg)', maxWidth: 1100, margin: '0 auto' }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                style={{ textAlign: 'center', marginBottom: 56 }}
            >
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--green)', marginBottom: 8 }}>
                    HAPPENING NOW IN FORT SMITH
                </div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 12 }}>
                    The Pulse of The Lab
                </div>
                <div style={{ fontSize: 15, color: 'var(--text-mid)', maxWidth: 600, margin: '0 auto' }}>
                    A living, breathing community of creators.
                </div>
            </motion.div>

            {/* Projects */}
            <div style={{ marginBottom: 56 }}>
                {sectionHeader('⚙', "What We're Building", "See what our members are working on this week.")}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                    {loading ? [1, 2, 3].map(i => <SkeletonCard key={i} />) :
                        projects.length === 0 ? <EmptyState label="projects" /> :
                            projects.map((project, i) => (
                                <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.1 }}>
                                    <ActivityCard {...project} />
                                </motion.div>
                            ))
                    }
                </div>
            </div>

            {/* Bounties */}
            <div>
                {sectionHeader('★', "Why We Need You", "Your skills are needed. Earn Stake to build your reputation and fuel your own projects.")}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                    {loading ? [1, 2, 3].map(i => <SkeletonCard key={i} />) :
                        bounties.length === 0 ? <EmptyState label="open bounties" /> :
                            bounties.map((bounty, i) => (
                                <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.1 }}>
                                    <ActivityCard {...bounty} />
                                </motion.div>
                            ))
                    }
                </div>
            </div>

            <div style={{ marginTop: 56, textAlign: 'center' }}>
                <a href="/auth/register">
                    <button className="btn btn--filled" style={{ fontSize: 13, padding: '12px 36px' }}>Join the Action</button>
                </a>
            </div>
        </div>
    );
};

export default CommunityPulse;
