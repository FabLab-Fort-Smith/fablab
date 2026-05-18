"use client";

import { useState } from "react";

const DEVICE_TYPES = ['Laptop', 'Desktop', 'Tablet', 'Other'];
const CONTACT_METHODS = ['Email', 'Phone'];

const ComputerRepairForm = () => {
    const [form, setForm] = useState({ name: '', email: '', phone: '', deviceType: '', issueDescription: '', contactMethod: '' });
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch('/api/v1/repairs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (res.ok) {
                setSubmitted(true);
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Submission failed. Please try again.');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const labelStyle = { display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 };

    return (
        <div style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
            <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '28px 32px' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '1.3rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 24, textAlign: 'center' }}>
                    Computer Repair Request
                </div>

                {submitted ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 24, color: 'var(--green)', marginBottom: 12 }}>✓</div>
                        <div style={{ fontSize: 14, color: 'var(--text)' }}>Thank you for your request. We will contact you soon.</div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label style={labelStyle}>NAME</label>
                            <input className="input" name="name" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} required value={form.name} onChange={handleChange} />
                        </div>
                        <div>
                            <label style={labelStyle}>EMAIL</label>
                            <input className="input" name="email" type="email" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} required value={form.email} onChange={handleChange} />
                        </div>
                        <div>
                            <label style={labelStyle}>PHONE NUMBER</label>
                            <input className="input" name="phone" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} required value={form.phone} onChange={handleChange} />
                        </div>
                        <div>
                            <label style={labelStyle}>DEVICE TYPE</label>
                            <select className="input" name="deviceType" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} required value={form.deviceType} onChange={handleChange}>
                                <option value="">Select device type...</option>
                                {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>ISSUE DESCRIPTION</label>
                            <textarea className="input" name="issueDescription" rows={4} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 13 }} required value={form.issueDescription} onChange={handleChange} />
                        </div>
                        <div>
                            <label style={labelStyle}>PREFERRED CONTACT METHOD</label>
                            <select className="input" name="contactMethod" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} required value={form.contactMethod} onChange={handleChange}>
                                <option value="">Select contact method...</option>
                                {CONTACT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        {error && <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '8px 12px', fontSize: 11, fontFamily: 'var(--mono)' }}>✗ {error}</div>}
                        <button type="submit" className="btn btn--filled" style={{ fontSize: 12, padding: '12px', marginTop: 4 }} disabled={submitting}>
                            {submitting ? '$ submitting...' : '$ Submit Request'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ComputerRepairForm;
