'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

function Modal({ open, onClose, title, children, footer }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
            <div className="card" style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="card-header">
                    <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>{title}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ padding: '20px 24px' }}>{children}</div>
                {footer && <div style={{ padding: '12px 24px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>{footer}</div>}
            </div>
        </div>
    );
}

const SEVERITY_COLOR = { critical: 'var(--red)', high: 'var(--amber)', medium: 'var(--cyan)', low: 'var(--text-dim)' };
const STATUS_COLOR   = { verified: 'var(--green)', fixed: 'var(--green)', rejected: 'var(--red)', open: 'var(--text-mid)' };

export default function BugsPage() {
    const { data: session } = useSession();
    const [bugs, setBugs] = useState([]);
    const [openSubmit, setOpenSubmit] = useState(false);
    const [openVerify, setOpenVerify] = useState(false);
    const [selectedBug, setSelectedBug] = useState(null);
    const [stakeReward, setStakeReward] = useState(0);
    const [tab, setTab] = useState(0);
    const [filterSeverity, setFilterSeverity] = useState('all');
    const [newBug, setNewBug] = useState({ title: '', description: '', stepsToReproduce: '', severity: 'low' });

    useEffect(() => { fetchBugs(); }, []);

    const fetchBugs = async () => {
        try {
            const res = await fetch('/api/v1/bugs?limit=100');
            if (res.ok) setBugs(await res.json());
        } catch {}
    };

    const handleSubmitBug = async () => {
        try {
            const res = await fetch('/api/v1/bugs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newBug),
            });
            if (res.ok) {
                setOpenSubmit(false);
                setNewBug({ title: '', description: '', stepsToReproduce: '', severity: 'low' });
                fetchBugs();
            }
        } catch {}
    };

    const handleUpdateStatus = async (bugID, status, reward = 0) => {
        try {
            const res = await fetch('/api/v1/bugs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bugID, status, stakeReward: reward }),
            });
            if (res.ok) { setOpenVerify(false); fetchBugs(); }
        } catch {}
    };

    const activeBugs   = bugs.filter(b => ['open', 'verified'].includes(b.status));
    const resolvedBugs = bugs.filter(b => ['fixed', 'rejected'].includes(b.status));

    const displayed = (() => {
        let list = tab === 0 ? activeBugs : tab === 1 ? resolvedBugs : bugs;
        if (filterSeverity !== 'all') list = list.filter(b => b.severity === filterSeverity);
        return list;
    })();

    const isAdmin = session?.user?.role === 'admin';

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> ./bugs --list
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                        bug tracker
                    </h1>
                </div>
                <button className="btn btn--filled" style={{ fontSize: 11 }} onClick={() => setOpenSubmit(true)}>
                    $ ./report --bug
                </button>
            </div>

            {/* Tabs + filter */}
            <div style={{ border: '1px solid var(--bd-1)', background: 'var(--bg-card)', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex' }}>
                        {[
                            [`active (${activeBugs.length})`, 0],
                            [`resolved (${resolvedBugs.length})`, 1],
                            ['all', 2],
                        ].map(([label, val]) => (
                            <button
                                key={val}
                                onClick={() => setTab(val)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 10,
                                    letterSpacing: '0.08em', color: tab === val ? 'var(--green)' : 'var(--text-dim)',
                                    borderBottom: tab === val ? '2px solid var(--green)' : '2px solid transparent',
                                    marginBottom: -1,
                                }}
                            >{label}</button>
                        ))}
                    </div>
                    <div style={{ padding: '8px 16px' }}>
                        <select
                            className="input"
                            value={filterSeverity}
                            onChange={e => setFilterSeverity(e.target.value)}
                            style={{ fontSize: 10, padding: '4px 8px' }}
                        >
                            <option value="all">all severities</option>
                            <option value="critical">critical</option>
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                            <option value="low">low</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Bug grid */}
            {displayed.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    <span style={{ color: 'var(--green)' }}>&gt;</span> no bugs in this category.
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                    {displayed.map(bug => (
                        <div key={bug.bugID} className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
                            {/* Status row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: SEVERITY_COLOR[bug.severity] || 'var(--text-dim)', border: `1px solid ${SEVERITY_COLOR[bug.severity] || 'var(--bd)'}`, padding: '2px 6px' }}>
                                    {bug.severity?.toUpperCase()}
                                </span>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: STATUS_COLOR[bug.status] || 'var(--text-dim)', border: `1px solid ${STATUS_COLOR[bug.status] || 'var(--bd)'}`, padding: '2px 6px' }}>
                                    {bug.status?.toUpperCase()}
                                </span>
                            </div>

                            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{bug.title}</div>
                            <div style={{ color: 'var(--text-mid)', fontSize: 11, lineHeight: 1.6, marginBottom: 10, flex: 1 }}>{bug.description}</div>

                            {bug.stepsToReproduce && (
                                <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-1)', padding: '8px 12px', marginBottom: 10 }}>
                                    <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 4 }}>STEPS_TO_REPRODUCE</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-mid)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{bug.stepsToReproduce}</div>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                <div>
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>by: {bug.submitterUsername}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                                        {new Date(bug.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    {bug.stakeReward > 0 && (
                                        <span style={{ fontSize: 10, color: 'var(--amber)', fontFamily: 'var(--mono)', border: '1px solid var(--amber)', padding: '2px 6px' }}>
                                            +{bug.stakeReward} stake
                                        </span>
                                    )}
                                    {isAdmin && bug.status === 'open' && (
                                        <>
                                            <button
                                                className="btn btn--sm"
                                                style={{ fontSize: 9, borderColor: 'var(--red)', color: 'var(--red)' }}
                                                onClick={() => handleUpdateStatus(bug.bugID, 'rejected')}
                                                title="Reject"
                                            >✕</button>
                                            <button
                                                className="btn btn--sm"
                                                style={{ fontSize: 9, borderColor: 'var(--green)', color: 'var(--green)' }}
                                                onClick={() => { setSelectedBug(bug); setStakeReward(0); setOpenVerify(true); }}
                                                title="Verify & Reward"
                                            >✓</button>
                                        </>
                                    )}
                                    {isAdmin && bug.status === 'verified' && (
                                        <button
                                            className="btn btn--sm"
                                            style={{ fontSize: 9 }}
                                            onClick={() => handleUpdateStatus(bug.bugID, 'fixed')}
                                            title="Mark Fixed"
                                        >$ fix</button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Submit dialog */}
            <Modal
                open={openSubmit}
                onClose={() => setOpenSubmit(false)}
                title="report a bug"
                footer={<>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setOpenSubmit(false)}>cancel</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleSubmitBug}>$ submit report</button>
                </>}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>TITLE</label>
                        <input className="input" value={newBug.title} onChange={e => setNewBug(p => ({ ...p, title: e.target.value }))} placeholder="short description of the bug" style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>SEVERITY</label>
                        <select className="input" value={newBug.severity} onChange={e => setNewBug(p => ({ ...p, severity: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }}>
                            <option value="low">low</option>
                            <option value="medium">medium</option>
                            <option value="high">high</option>
                            <option value="critical">critical</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>DESCRIPTION</label>
                        <textarea className="input" rows={3} value={newBug.description} onChange={e => setNewBug(p => ({ ...p, description: e.target.value }))} placeholder="what happened?" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>STEPS_TO_REPRODUCE</label>
                        <textarea className="input" rows={3} value={newBug.stepsToReproduce} onChange={e => setNewBug(p => ({ ...p, stepsToReproduce: e.target.value }))} placeholder="1. go to...\n2. click...\n3. see error" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
                    </div>
                </div>
            </Modal>

            {/* Verify dialog */}
            <Modal
                open={openVerify}
                onClose={() => setOpenVerify(false)}
                title="verify bug & award stake"
                footer={<>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setOpenVerify(false)}>cancel</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10, borderColor: 'var(--green)', background: 'rgba(57,255,20,0.1)', color: 'var(--green)' }} onClick={() => handleUpdateStatus(selectedBug.bugID, 'verified', stakeReward)}>
                        $ verify & award
                    </button>
                </>}
            >
                <p style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.7, marginBottom: 16 }}>
                    Verifying marks this bug as confirmed. Optionally award stake to the reporter.
                </p>
                <div>
                    <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>STAKE_REWARD_AMOUNT</label>
                    <input className="input" type="number" value={stakeReward} onChange={e => setStakeReward(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
            </Modal>
        </div>
    );
}
