"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

const ManageMembership = () => {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [membershipStatus, setMembershipStatus] = useState(null);

    useEffect(() => {
        if (!session) return;
        setLoading(true);
        fetch("/api/membership/status", { headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.user?.token}` } })
            .then(r => { if (!r.ok) throw new Error("Failed to fetch membership status."); return r.json(); })
            .then(data => setMembershipStatus(data))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [session]);

    const handleUpgrade = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/membership/upgrade", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.user?.token}` }, body: JSON.stringify({ plan: "premium" }) });
            if (!res.ok) throw new Error("Failed to upgrade membership.");
            setMembershipStatus(await res.json());
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    const handleCancel = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/membership/cancel", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.user?.token}` } });
            if (!res.ok) throw new Error("Failed to cancel membership.");
            setMembershipStatus(await res.json());
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    return (
        <div style={{ padding: '20px 24px', maxWidth: 600 }}>
            <div style={{ marginBottom: 28 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}><span style={{ color: 'var(--green)' }}>$</span> ./membership --manage</div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>manage membership</h1>
            </div>

            {loading && <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 16 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>}

            {error && <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px 14px', marginBottom: 20, fontSize: 12, fontFamily: 'var(--mono)' }}>✕ {error}</div>}

            {membershipStatus ? (
                <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '20px 24px', marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginBottom: 4 }}>CURRENT_PLAN</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 12 }}>{membershipStatus.plan}</div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 2 }}>STATUS</div>
                            <div style={{ fontSize: 12, color: 'var(--green)' }}>{membershipStatus.status}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 2 }}>RENEWAL_DATE</div>
                            <div style={{ fontSize: 12, color: 'var(--text-mid)', fontFamily: 'var(--mono)' }}>{membershipStatus.renewalDate}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }} onClick={handleUpgrade} disabled={loading || membershipStatus.plan === "premium"}>
                            $ upgrade to premium
                        </button>
                        <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={handleCancel} disabled={loading}>
                            ✕ cancel membership
                        </button>
                    </div>
                </div>
            ) : (
                !loading && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>You don&apos;t have an active membership. Select a plan to get started.</div>
            )}
        </div>
    );
};

export default ManageMembership;
