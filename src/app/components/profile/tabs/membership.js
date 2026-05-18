"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import UsersService from '@/services/users';
import LoadingTerminal from "@/app/components/LoadingTerminal";
import VolunteerLog from "./VolunteerLog";

const REQUIRED_VOLUNTEER_HOURS = 4;

const STEPS = [
    { label: 'Submit Application', description: 'Complete the membership questionnaire to get started.' },
    { label: 'Initial Contact', description: 'A team member will reach out within 3-5 business days.' },
    { label: 'Onboarding', description: 'Meet with us in person for paperwork and safety orientation.' },
    { label: 'Select Membership', description: 'Choose a plan — your access key is issued immediately after payment.' },
];

const statusColor = (s) => {
    if (s === 'ACTIVE') return 'var(--green)';
    if (s === 'PAUSED') return 'var(--amber, #ffaa00)';
    if (s === 'CANCELED' || s === 'DEACTIVATED') return 'var(--red, #ff4444)';
    return 'var(--text-dim)';
};

const MembershipTab = ({ user, onUpdateMembership, membershipApplied = false }) => {
    const [plans, setPlans] = useState([]);
    const [subscription, setSubscription] = useState(null);
    const [subLoading, setSubLoading] = useState(false);
    const [currentMembership, setCurrentMembership] = useState(user?.membership || null);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const [billingType, setBillingType] = useState("MONTHLY");
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [successDismissed, setSuccessDismissed] = useState(false);
    const [couponCode, setCouponCode] = useState('');

    const membershipStatus = user?.membership || {};
    const isReadyForPayment = membershipStatus.applicationDate && membershipStatus.contacted && membershipStatus.onboardingComplete;
    const isActiveSubscriber = membershipStatus.subscriptionStatus === 'ACTIVE' && membershipStatus.squareSubscriptionId;
    const showApplicationSuccess = membershipApplied && !successDismissed;

    const activeStep = (() => {
        if (!membershipStatus.applicationDate) return 0;
        if (!membershipStatus.contacted) return 1;
        if (!membershipStatus.onboardingComplete) return 2;
        return 3;
    })();

    const volunteerLog = user?.membership?.volunteerLog || user?.volunteerLog || [];
    const currentMonthHours = volunteerLog.filter(entry => {
        const d = new Date(entry.date);
        const now = new Date();
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).reduce((sum, e) => sum + (e.hours || 0), 0);

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    useEffect(() => { setCurrentMembership(user?.membership); }, [user]);

    // Fetch live subscription details from Square when subscribed
    useEffect(() => {
        if (!isActiveSubscriber) return;
        const fetchSub = async () => {
            setSubLoading(true);
            try {
                const res = await fetch(`/api/v1/memberships/subscription?userID=${user.userID}`);
                if (res.ok) setSubscription(await res.json());
            } catch { /* non-fatal */ }
            finally { setSubLoading(false); }
        };
        fetchSub();
    }, [isActiveSubscriber, user?.userID]);

    useEffect(() => {
        if (!isReadyForPayment || isActiveSubscriber) return;
        const fetchPlans = async () => {
            setLoading(true);
            try {
                const res = await fetch("/api/v1/plans");
                if (!res.ok) throw new Error();
                setPlans(await res.json());
            } catch { showToast("Failed to load membership plans.", 'error'); }
            finally { setLoading(false); }
        };
        fetchPlans();
    }, [isReadyForPayment, isActiveSubscriber]);

    const handleCheckout = async (plan) => {
        let planID, price;
        if (plan.variations?.length) {
            const variation = plan.variations.find(v => v.cadence === billingType);
            if (!variation) { showToast("Selected billing option not available.", 'error'); return; }
            if (variation.priceCents == null) { showToast("Pricing unavailable. Please contact us.", 'error'); return; }
            planID = variation.id;
            price = variation.priceCents / 100;
        } else {
            planID = plan.id;
            price = plan.price;
        }
        try {
            const res = await fetch(`/api/v1/memberships/${planID}/checkout`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userID: user.userID, price, currency: "USD", couponCode: couponCode.trim() || undefined }),
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || "Failed to start checkout.", 'error'); return; }
            if (data.url || data.checkoutUrl) window.location.href = data.url || data.checkoutUrl;
        } catch (err) {
            showToast(err.message || "Failed to start checkout.", 'error');
        }
    };

    const handleSubscriptionAction = async (action) => {
        setActionLoading(true);
        try {
            const res = await fetch('/api/v1/memberships/subscription', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: user.userID, action }),
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Action failed.', 'error'); return; }
            setCancelDialogOpen(false);
            setPauseDialogOpen(false);
            showToast(
                action === 'cancel' ? 'Subscription canceled. Access will remain until end of billing period.' :
                action === 'pause' ? 'Subscription paused at end of current billing period.' :
                'Subscription resumed.',
                'success'
            );
            // Refresh subscription state
            const r2 = await fetch(`/api/v1/memberships/subscription?userID=${user.userID}`);
            if (r2.ok) setSubscription(await r2.json());
        } catch { showToast('An error occurred.', 'error'); }
        finally { setActionLoading(false); }
    };

    const filteredPlans = plans.filter(p =>
        !p.variations?.length || p.variations.some(v => v.cadence === billingType)
    );

    if (loading) return <LoadingTerminal steps={["Fetching membership plans...", "Checking user status...", "Loading payment options..."]} />;

    // ── Pre-onboarding steps ──────────────────────────────────────────────────
    if (!isReadyForPayment) {
        return (
            <div style={{ padding: '20px 24px' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '1.3rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 4 }}>Membership Application Status</div>
                {showApplicationSuccess && (
                    <div style={{ border: '1px solid var(--green)', color: 'var(--green)', background: 'rgba(57,255,20,0.05)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>✓ Application submitted! We'll reach out within 3-5 business days.</span>
                        <button onClick={() => setSuccessDismissed(true)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 14 }}>×</button>
                    </div>
                )}
                <div style={{ border: '1px solid var(--cyan)', color: 'var(--cyan)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 24 }}>
                    ℹ Complete the following steps to unlock membership payment options.
                </div>
                <div style={{ border: '1px solid var(--green)', background: 'var(--bg-card)', padding: '20px 24px' }}>
                    {STEPS.map((step, index) => {
                        const isComplete = index < activeStep;
                        const isCurrent = index === activeStep;
                        return (
                            <div key={step.label} style={{ display: 'flex', gap: 16, marginBottom: index < STEPS.length - 1 ? 20 : 0 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: isComplete ? 'var(--green)' : isCurrent ? 'var(--bg-card)' : 'var(--bg-1)', border: `2px solid ${index <= activeStep ? 'var(--green)' : 'var(--bd)'}`, color: index <= activeStep ? 'var(--green)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, flexShrink: 0 }}>
                                        {isComplete ? '✓' : index + 1}
                                    </div>
                                    {index < STEPS.length - 1 && <div style={{ width: 1, flex: 1, background: index < activeStep ? 'var(--green)' : 'var(--bd)', minHeight: 20, marginTop: 4 }} />}
                                </div>
                                <div style={{ paddingBottom: 20 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? 'var(--green)' : isComplete ? 'var(--text-bright)' : 'var(--text-dim)', marginBottom: 4 }}>{step.label}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{step.description}</div>
                                    {index === 0 && isCurrent && (
                                        <a href={user?.userID ? `/dashboard/${user.userID}/onboarding` : "/dashboard/onboarding"}>
                                            <button className="btn btn--filled btn--sm" style={{ fontSize: 10, marginTop: 12 }}>$ complete questionnaire</button>
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {membershipStatus.applicationDate && (
                        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
                            Last updated: {new Date(membershipStatus.applicationDate).toLocaleDateString()}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Active subscription dialogs ───────────────────────────────────────────
    const CancelDialog = () => (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '28px 32px', maxWidth: 420, width: '90%', fontFamily: 'var(--mono)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 8 }}>cancel_subscription</div>
                <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 8 }}>
                    Your subscription will remain active until the end of the current billing period.
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 24 }}>
                    Charged through: {subscription?.chargedThroughDate || '—'}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn--sm" onClick={() => setCancelDialogOpen(false)} style={{ fontSize: 10 }}>keep plan</button>
                    <button className="btn btn--sm" onClick={() => handleSubscriptionAction('cancel')} disabled={actionLoading} style={{ fontSize: 10, borderColor: 'var(--red, #ff4444)', color: 'var(--red, #ff4444)' }}>
                        {actionLoading ? 'canceling...' : '$ confirm cancel'}
                    </button>
                </div>
            </div>
        </div>
    );

    const PauseDialog = () => (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '28px 32px', maxWidth: 420, width: '90%', fontFamily: 'var(--mono)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 8 }}>pause_subscription</div>
                <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 24 }}>
                    Billing will pause at the end of your current cycle. You can resume at any time.
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn--sm" onClick={() => setPauseDialogOpen(false)} style={{ fontSize: 10 }}>keep active</button>
                    <button className="btn btn--sm" onClick={() => handleSubscriptionAction('pause')} disabled={actionLoading} style={{ fontSize: 10, borderColor: 'var(--amber, #ffaa00)', color: 'var(--amber, #ffaa00)' }}>
                        {actionLoading ? 'pausing...' : '$ confirm pause'}
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div style={{ padding: '20px 24px' }}>
            {toast && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, border: `1px solid ${toast.type === 'error' ? 'var(--red)' : toast.type === 'success' ? 'var(--green)' : 'var(--cyan)'}`, color: toast.type === 'error' ? 'var(--red)' : toast.type === 'success' ? 'var(--green)' : 'var(--cyan)', background: 'var(--bg-card)', padding: '10px 20px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {toast.message}
                </div>
            )}

            {cancelDialogOpen && <CancelDialog />}
            {pauseDialogOpen && <PauseDialog />}

            <div style={{ fontFamily: 'var(--display)', fontSize: '1.3rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 16 }}>Manage Your Membership</div>

            {/* Volunteer hours nag */}
            {currentMembership?.accessKey?.issued && currentMonthHours < REQUIRED_VOLUNTEER_HOURS && (
                <div style={{ border: '1px solid var(--yellow, #ffcc00)', color: 'var(--yellow, #ffcc00)', background: 'rgba(255,204,0,0.05)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 16 }}>
                    ⚠ {currentMonthHours} / {REQUIRED_VOLUNTEER_HOURS} volunteer hours logged this month.
                </div>
            )}

            {/* ── Active subscription card ───────────────────────────────── */}
            {isActiveSubscriber && (
                <div style={{ border: '1px solid var(--green)', background: 'var(--bg-card)', padding: '20px 24px', marginBottom: 24, fontFamily: 'var(--mono)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 12 }}>$ subscription.status</div>

                    {subLoading ? (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>loading subscription details...</div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                                <div style={{ fontFamily: 'var(--display)', fontSize: '1.4rem', letterSpacing: '-0.04em', color: 'var(--text-bright)' }}>
                                    {subscription?.planName || currentMembership?.planName || 'Active Plan'}
                                </div>
                                {(subscription?.variationName || currentMembership?.variationName) && (
                                    <span style={{ fontSize: 10, color: 'var(--text-dim)', border: '1px solid var(--bd)', padding: '2px 8px' }}>
                                        {subscription?.variationName || currentMembership?.variationName}
                                    </span>
                                )}
                                <span style={{ fontSize: 10, border: `1px solid ${statusColor(subscription?.status || 'ACTIVE')}`, color: statusColor(subscription?.status || 'ACTIVE'), padding: '2px 8px', letterSpacing: '0.06em' }}>
                                    {subscription?.status || 'ACTIVE'}
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                                {subscription?.priceCents != null && (
                                    <div>
                                        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 2 }}>AMOUNT</div>
                                        <div style={{ fontSize: 13, color: 'var(--green)' }}>
                                            ${(subscription.priceCents / 100).toFixed(2)} / {subscription.cadence === 'ANNUAL' ? 'yr' : 'mo'}
                                        </div>
                                    </div>
                                )}
                                {subscription?.startDate && (
                                    <div>
                                        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 2 }}>STARTED</div>
                                        <div style={{ fontSize: 13, color: 'var(--text)' }}>{new Date(subscription.startDate).toLocaleDateString()}</div>
                                    </div>
                                )}
                                {subscription?.chargedThroughDate && (
                                    <div>
                                        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 2 }}>NEXT BILLING</div>
                                        <div style={{ fontSize: 13, color: 'var(--text)' }}>{new Date(subscription.chargedThroughDate).toLocaleDateString()}</div>
                                    </div>
                                )}
                                {subscription?.canceledDate && (
                                    <div>
                                        <div style={{ fontSize: 9, color: 'var(--red, #ff4444)', letterSpacing: '0.1em', marginBottom: 2 }}>CANCELS</div>
                                        <div style={{ fontSize: 13, color: 'var(--red, #ff4444)' }}>{new Date(subscription.canceledDate).toLocaleDateString()}</div>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {subscription?.status === 'ACTIVE' && (
                                    <button className="btn btn--sm" onClick={() => setPauseDialogOpen(true)} style={{ fontSize: 10, borderColor: 'var(--amber, #ffaa00)', color: 'var(--amber, #ffaa00)' }}>
                                        $ pause
                                    </button>
                                )}
                                {subscription?.status === 'PAUSED' && (
                                    <button className="btn btn--sm" onClick={() => handleSubscriptionAction('resume')} disabled={actionLoading} style={{ fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }}>
                                        {actionLoading ? 'resuming...' : '$ resume'}
                                    </button>
                                )}
                                {subscription?.status !== 'CANCELED' && (
                                    <button className="btn btn--sm" onClick={() => setCancelDialogOpen(true)} style={{ fontSize: 10, borderColor: 'var(--red, #ff4444)', color: 'var(--red, #ff4444)' }}>
                                        $ cancel
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Plan selection (shown when not subscribed) ─────────────── */}
            {!isActiveSubscriber && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 24 }}>
                        {['MONTHLY', 'ANNUAL'].map(type => (
                            <button key={type} onClick={() => setBillingType(type)} style={{ padding: '8px 24px', background: billingType === type ? 'rgba(57,255,20,0.1)' : 'none', border: '1px solid var(--green)', color: 'var(--green)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em' }}>
                                {type}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24, maxWidth: 340 }}>
                        <input
                            type="text"
                            placeholder="coupon code (optional)"
                            value={couponCode}
                            onChange={e => setCouponCode(e.target.value.toUpperCase())}
                            style={{ flex: 1, background: 'var(--bg-1)', border: '1px solid var(--bd)', color: 'var(--text)', padding: '7px 10px', fontSize: 12, fontFamily: 'var(--mono)', outline: 'none', letterSpacing: '0.06em' }}
                        />
                        {couponCode && <button className="btn btn--sm" onClick={() => setCouponCode('')} style={{ fontSize: 10, padding: '6px 10px' }}>×</button>}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
                        <div style={{ border: '2px solid var(--green)', background: (!currentMembership || currentMembership?.type === 'guest') ? 'rgba(57,255,20,0.05)' : 'var(--bg-card)', padding: '20px 20px' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 8 }}>Guest</div>
                            <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 12 }}>Free access with a member.</div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--green)', marginBottom: 16 }}>Free</div>
                            <button
                                className="btn btn--sm"
                                style={{ width: '100%', fontSize: 10 }}
                                disabled={!currentMembership || currentMembership?.type === 'guest'}
                                onClick={() => setCancelDialogOpen(true)}
                            >
                                {(!currentMembership || currentMembership?.type === 'guest') ? "Current Plan" : "Switch to Guest"}
                            </button>
                        </div>

                        {filteredPlans.map(plan => {
                            const variation = plan.variations?.find(v => v.cadence === billingType && v.priceCents != null)
                                ?? plan.variations?.find(v => v.cadence === billingType);
                            const hasPrice = variation?.priceCents != null;
                            return (
                                <div key={plan.id} style={{ border: '2px solid var(--green)', background: 'var(--bg-card)', padding: '20px 20px', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>{plan.name}</div>
                                    <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>
                                        {variation && hasPrice ? `$${(variation.priceCents / 100).toFixed(2)} / ${billingType === 'MONTHLY' ? 'mo' : 'yr'}` : 'Contact us'}
                                    </div>
                                    {plan.description && <div style={{ fontSize: 11, color: 'var(--text-mid)', marginBottom: 10, lineHeight: 1.5 }}>{plan.description}</div>}
                                    {plan.benefits?.length > 0 && (
                                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                                            {plan.benefits.map((b, i) => (
                                                <li key={i} style={{ fontSize: 11, color: 'var(--text)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                                    <span style={{ color: 'var(--green)', flexShrink: 0 }}>✓</span> {b}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <button
                                        className="btn btn--filled btn--sm"
                                        style={{ width: '100%', fontSize: 10 }}
                                        disabled={!variation || !hasPrice}
                                        onClick={() => handleCheckout(plan)}
                                    >
                                        $ subscribe
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            <VolunteerLog user={user} onUpdate={onUpdateMembership} />
        </div>
    );
};

export default MembershipTab;
