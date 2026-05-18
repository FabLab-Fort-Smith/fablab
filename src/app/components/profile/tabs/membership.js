"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import UsersService from '@/services/users';
import LoadingTerminal from "@/app/components/LoadingTerminal";
import VolunteerLog from "./VolunteerLog";

const STEPS = [
    { label: 'Submit Application', description: 'Please complete the onboarding questionnaire to get started.' },
    { label: 'Initial Contact', description: 'A team member will reach out to you shortly to discuss your application.' },
    { label: 'Onboarding', description: 'Meet with us to complete paperwork and safety orientation.' },
    { label: 'Select Membership', description: 'Choose a plan that fits your needs.' },
];

const MembershipTab = ({ user, onUpdateMembership }) => {
    const [plans, setPlans] = useState([]);
    const [currentMembership, setCurrentMembership] = useState(user?.membership || null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [billingType, setBillingType] = useState("monthly");
    const router = useRouter();

    const membershipStatus = user?.membership || {};
    const isReadyForPayment = membershipStatus.applicationDate && membershipStatus.contacted && membershipStatus.onboardingComplete;

    const activeStep = (() => {
        if (!membershipStatus.applicationDate) return 0;
        if (!membershipStatus.contacted) return 1;
        if (!membershipStatus.onboardingComplete) return 2;
        return 3;
    })();

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    useEffect(() => { setCurrentMembership(user?.membership); }, [user]);

    useEffect(() => {
        const fetchPlans = async () => {
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
    }, []);

    const handleSwitchToGuest = async () => {
        if (!confirm("Are you sure you want to switch to Guest? This will cancel your current plan benefits.")) return;
        try {
            const guestMembership = { ...user.membership, type: 'guest', active: false, applicationDate: user.membership?.applicationDate, contacted: user.membership?.contacted, onboardingComplete: user.membership?.onboardingComplete, planID: null, subscriptionID: null, name: 'Guest', price: 0 };
            const updatedUser = await UsersService.updateUser(user.userID, { membership: guestMembership });
            setCurrentMembership(guestMembership);
            if (onUpdateMembership) onUpdateMembership(updatedUser);
            showToast("Successfully switched to Guest.", 'success');
        } catch (error) {
            showToast("Failed to update membership.", 'error');
        }
    };

    const filteredPlans = plans.filter(p => p.name.toLowerCase().includes(billingType));

    const loadingSteps = ["Fetching membership plans...", "Checking user status...", "Loading payment options..."];
    if (loading) return <LoadingTerminal steps={loadingSteps} />;

    if (!isReadyForPayment) {
        return (
            <div style={{ padding: '20px 24px' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '1.3rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 4 }}>Membership Application Status</div>
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

            <div style={{ fontFamily: 'var(--display)', fontSize: '1.3rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 16 }}>Manage Your Membership</div>

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
                {['monthly', 'annual'].map(type => (
                    <button key={type} onClick={() => setBillingType(type)} style={{ padding: '8px 24px', background: billingType === type ? 'rgba(57,255,20,0.1)' : 'none', border: '1px solid var(--green)', color: 'var(--green)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em' }}>
                        {type.toUpperCase()}
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
                        onClick={handleSwitchToGuest}
                    >
                        {(!currentMembership || currentMembership?.type === 'guest') ? "Current Plan" : "Switch to Guest"}
                    </button>
                </div>

                {filteredPlans.map(plan => (
                    <div key={plan.id} style={{ border: '2px solid var(--green)', background: currentMembership?.id === plan.id ? 'rgba(57,255,20,0.05)' : 'var(--bg-card)', padding: '20px 20px' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 8 }}>{plan.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 12 }}>
                            {plan.name.includes("Plus") ? "Access badge & dedicated desk." : "Access badge."}
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--green)', marginBottom: 16 }}>${plan.price}</div>
                        <div style={{ display: 'flex', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: plan.embed }} />
                    </div>
                ))}
            </div>

            <VolunteerLog user={user} onUpdate={onUpdateMembership} />
        </div>
    );
};

export default MembershipTab;
