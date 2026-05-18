"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PaymentForm, CreditCard } from "react-square-web-payments-sdk";
import { submitPayment } from "@/app/actions/actions";
import MembershipService from "@/services/memberships";

const CheckoutPage = ({ user }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");
  const variationId = searchParams.get("variationId");

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [fullName, setFullName] = useState(`${user?.fName || ""} ${user?.lName || ""}`.trim());
  const [address, setAddress] = useState(user?.address || "");
  const [city, setCity] = useState(user?.city || "");
  const [state, setState] = useState(user?.state || "");
  const [zip, setZip] = useState(user?.zip || "");
  const [country, setCountry] = useState(user?.country || "US");

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const fetchPlanDetails = async () => {
      try {
        setLoading(true);
        const plans = await MembershipService.getMembershipPlans();
        const selectedPlan = plans.find((p) => p.id === planId);
        if (!selectedPlan) throw new Error("Plan not found.");
        setPlan(selectedPlan);
      } catch (error) {
        showToast(error.message || "Failed to load checkout details.", 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchPlanDetails();
  }, [planId]);

  const handlePaymentSuccess = async (token) => {
    try {
      setLoading(true);
      const response = await submitPayment({
        planVariationId: variationId,
        paymentMethod: token.token,
        billingAddress: { fullName, address, city, state, zip, country },
      });
      if (response.success) {
        showToast("Payment successful! Redirecting...", 'success');
        setTimeout(() => router.push("/confirmation"), 2000);
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      showToast("Payment failed. Please try again.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const labelStyle = { display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 };
  const fieldWrap = { marginBottom: 16 };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
      <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 13 }}>loading<span style={{ animation: 'blink 1s step-end infinite' }}>_</span></div>
    </div>
  );

  if (!plan) return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 13 }}>✕ Plan details not found.</div>
    </div>
  );

  return (
    <div style={{ padding: '20px 24px', maxWidth: 600, margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, border: `1px solid ${toast.type === 'error' ? 'var(--red)' : toast.type === 'success' ? 'var(--green)' : 'var(--cyan)'}`, color: toast.type === 'error' ? 'var(--red)' : toast.type === 'success' ? 'var(--green)' : 'var(--cyan)', background: 'var(--bg-card)', padding: '10px 20px', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}><span style={{ color: 'var(--green)' }}>$</span> ./checkout --plan</div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>checkout</h1>
      </div>

      <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '24px 28px', marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>{plan.name}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--green)', marginBottom: 20 }}>
          ${plan.price} / {plan.cadence}
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>FULL_NAME</label>
          <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={fullName} onChange={e => setFullName(e.target.value)} required />
        </div>
        <div style={fieldWrap}>
          <label style={labelStyle}>ADDRESS</label>
          <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={address} onChange={e => setAddress(e.target.value)} required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>CITY</label>
            <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={city} onChange={e => setCity(e.target.value)} required />
          </div>
          <div>
            <label style={labelStyle}>STATE</label>
            <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={state} onChange={e => setState(e.target.value)} required />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div>
            <label style={labelStyle}>ZIP_CODE</label>
            <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={zip} onChange={e => setZip(e.target.value)} required />
          </div>
          <div>
            <label style={labelStyle}>COUNTRY</label>
            <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={country} onChange={e => setCountry(e.target.value)} required />
          </div>
        </div>

        <PaymentForm
          applicationId={process.env.NEXT_PUBLIC_SQUARE_APP_ID}
          locationId={process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID}
          cardTokenizeResponseReceived={handlePaymentSuccess}
        >
          <CreditCard />
        </PaymentForm>
      </div>
    </div>
  );
};

export default CheckoutPage;
