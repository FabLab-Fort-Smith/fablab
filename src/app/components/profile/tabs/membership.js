"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

const MembershipTab = ({ user, onUpdateMembership }) => {
    const [plans, setPlans] = useState([]);
    const [currentMembership, setCurrentMembership] = useState(user?.membership || null);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const [billingType, setBillingType] = useState("MONTHLY");
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [successDismissed, setSuccessDismissed] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    const membershipStatus = user?.membership || {};
    const isReadyForPayment = membershipStatus.applicationDate && membershipStatus.contacted && membershipStatus.onboardingComplete;

    const showApplicationSuccess = searchParams.get("membershipStatus") === "applied" && !successDismissed;

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

    useEffect(() => {
        if (!isReadyForPayment) return;
        const fetchPlans = async () => {
            setLoading(true);
            try {
                const res = await fetch("/api/v1/plans");
                if (!res.ok) throw new Error("Failed to fetch membership plans.");
                setPlans(await res.json());
            } catch (error) {
                showToast("Failed to load membership plans.", 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchPlans();
    }, [isReadyForPayment]);

    const handleCheckout = async (plan) => {
        let planID, price;

        if (plan.variations?.length) {
            const variation = plan.variations.find(v => v.cadence === billingType);
            if (!variation) {
                showToast("Selected billing option not available.", 'error');
                return;
            }
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
                body: JSON.stringify({ userID: user.userID, price, currency: "USD" }),
            });
            if (!res.ok) throw new Error("Failed to create checkout");
            const data = await res.json();
            if (data.url || data.checkoutUrl) {
                window.location.href = data.url || data.checkoutUrl;
            }
        } catch (err) {
            showToast("Failed to start checkout. Please try again.", 'error');
        }
    };

    const handleSwitchToGuest = async () => {
        setCancelDialogOpen(false);
        try {
            const guestMembership = {
                ...user.membership,
                type: 'guest',
                active: false,
                applicationDate: user.membership?.applicationDate,
                contacted: user.membership?.contacted,
                onboardingComplete: user.membership?.onboardingComplete,
                planID: null,
                subscriptionID: null,
                name: 'Guest',
                price: 0,
            };
            const updatedUser = await UsersService.updateUser(user.userID, { membership: guestMembership });
            setCurrentMembership(guestMembership);
            if (onUpdateMembership) onUpdateMembership(updatedUser);
            showToast("Successfully switched to Guest.", 'success');
        } catch (error) {
            showToast("Failed to update membership.", 'error');
        }
    };

    const filteredPlans = plans.filter(p =>
        !p.variations?.length || p.variations.some(v => v.cadence === billingType)
    );

    const loadingSteps = ["Fetching membership plans...", "Checking user status...", "Loading payment options..."];
    if (loading) return <LoadingTerminal steps={loadingSteps} />;

    if (!isReadyForPayment) {
        return (
            <div style={{ padding: '20px 24px' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '1.3rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 4 }}>Membership Application Status</div>

                {showApplicationSuccess && (
                    <div style={{ border: '1px solid var(--green)', color: 'var(--green)', background: 'rgba(57,255,20,0.05)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>✓ Application submitted! We'll reach out within 3-5 business days. Check your email for a confirmation.</span>
                        <button onClick={() => setSuccessDismissed(true)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 0 0 12px' }}>×</button>
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

    return (
        <div style={{ padding: '20px 24px' }}>
            {toast && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, border: `1px solid ${toast.type === 'error' ? 'var(--red)' : toast.type === 'success' ? 'var(--green)' : 'var(--cyan)'}`, color: toast.type === 'error' ? 'var(--red)' : toast.type === 'success' ? 'var(--green)' : 'var(--cyan)', background: 'var(--bg-card)', padding: '10px 20px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {toast.message}
                </div>
            )}

            {/* Cancel to Guest confirmation dialog */}
            {cancelDialogOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '28px 32px', maxWidth: 420, width: '90%', fontFamily: 'var(--mono)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 12 }}>Switch to Guest?</div>
                        <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 24 }}>This will cancel your current plan benefits. Your application history will be preserved.</div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setCancelDialogOpen(false)}>Cancel</button>
                            <button className="btn btn--filled btn--sm" style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={handleSwitchToGuest}>Confirm Switch</button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ fontFamily: 'var(--display)', fontSize: '1.3rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 16 }}>Manage Your Membership</div>

            {/* Volunteer hours nag — never blocks access */}
            {currentMembership?.accessKey?.issued && currentMonthHours < REQUIRED_VOLUNTEER_HOURS && (
                <div style={{ border: '1px solid var(--yellow, #ffcc00)', color: 'var(--yellow, #ffcc00)', background: 'rgba(255,204,0,0.05)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 16 }}>
                    ⚠ You have {currentMonthHours} / {REQUIRED_VOLUNTEER_HOURS} volunteer hours logged this month. Please log your hours to stay in good standing.
                </div>
            )}

            <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 8 }}>
                    {currentMembership && currentMembership.type !== 'guest' && currentMembership.name
                        ? `You are currently subscribed to the ${currentMembership.name} plan.`
                        : "You are not subscribed to any membership plan (Guest access)."}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {currentMembership?.waived && (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', border: '1px solid var(--green)', padding: '3px 10px' }}>✓ Fees Waived</span>
                    )}
                    {currentMembership?.sponsored && (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '3px 10px' }}>
                            ★ {currentMembership.sponsoredBy ? `Sponsored by ${currentMembership.sponsoredBy}` : "Sponsored"}
                        </span>
                    )}
                </div>
            </div>

            {/* Billing Toggle */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 24 }}>
                {['MONTHLY', 'ANNUAL'].map(type => (
                    <button key={type} onClick={() => setBillingType(type)} style={{ padding: '8px 24px', background: billingType === type ? 'rgba(57,255,20,0.1)' : 'none', border: '1px solid var(--green)', color: 'var(--green)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em' }}>
                        {type}
                    </button>
                ))}
            </div>

            {/* Plan Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
                {/* Guest Card */}
                <div style={{ border: '2px solid var(--green)', background: (!currentMembership || currentMembership?.type === 'guest') ? 'rgba(57,255,20,0.05)' : 'var(--bg-card)', padding: '20px 20px' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 8 }}>Guest</div>
                    <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 12 }}>Free access with a member.</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--green)', marginBottom: 16 }}>Free</div>
                    <button
                        className={`btn btn--sm ${(!currentMembership || currentMembership?.type === 'guest') ? 'btn--ghost' : 'btn--filled'}`}
                        style={{ width: '100%', fontSize: 10, borderColor: (!currentMembership || currentMembership?.type === 'guest') ? 'var(--green)' : undefined, color: (!currentMembership || currentMembership?.type === 'guest') ? 'var(--green)' : undefined }}
                        disabled={!currentMembership || currentMembership?.type === 'guest'}
                        onClick={() => setCancelDialogOpen(true)}
                    >
                        {(!currentMembership || currentMembership?.type === 'guest') ? "Current Plan" : "Switch to Guest"}
                    </button>
                </div>

                {filteredPlans.map(plan => {
                    const variation = plan.variations?.find(v => v.cadence === billingType);
                    const isCurrentPlan = currentMembership?.squareSubscriptionId && currentMembership?.planName === plan.name;
                    return (
                        <div key={plan.id} style={{ border: '2px solid var(--green)', background: isCurrentPlan ? 'rgba(57,255,20,0.05)' : 'var(--bg-card)', padding: '20px 20px' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 8 }}>{plan.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 12 }}>
                                {variation ? `$${(variation.priceCents / 100).toFixed(2)} / ${billingType === 'MONTHLY' ? 'mo' : 'yr'}` : 'Contact us for pricing'}
                            </div>
                            <button
                                className="btn btn--filled btn--sm"
                                style={{ width: '100%', fontSize: 10 }}
                                disabled={isCurrentPlan || !variation}
                                onClick={() => handleCheckout(plan)}
                            >
                                {isCurrentPlan ? "Current Plan" : "$ subscribe"}
                            </button>
                        </div>
                    );
                })}
            </div>

            <VolunteerLog user={user} onUpdate={onUpdateMembership} />
        </div>
    );
};

export default MembershipTab;
