"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

const ContactSection = () => {
    const shouldReduceMotion = useReducedMotion();
    const [status, setStatus] = useState('idle');
    const [formData, setFormData] = useState({ name: '', email: '', message: '' });
    const [toast, setToast] = useState(null);

    const showToast = (message, type) => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 6000);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('submitting');
        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                setStatus('idle');
                setFormData({ name: '', email: '', message: '' });
                showToast("Message sent successfully! We'll get back to you soon.", 'success');
            } else {
                setStatus('idle');
                showToast("Failed to send message. Please try again or email us directly.", 'error');
            }
        } catch {
            setStatus('idle');
            showToast("Failed to send message. Please try again or email us directly.", 'error');
        }
    };

    const labelStyle = { display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 };

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, ease: "easeOut" }}
        >
            {toast && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, border: `1px solid ${toast.type === 'error' ? 'var(--red)' : 'var(--green)'}`, color: toast.type === 'error' ? 'var(--red)' : 'var(--green)', background: 'var(--bg-card)', padding: '10px 20px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {toast.message}
                </div>
            )}

            <div style={{ padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: 'var(--bg)' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '1.8rem', letterSpacing: '-0.04em', color: 'var(--green)', marginBottom: 24 }}>
                    We&apos;d Love to Hear From You
                </div>

                <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, marginBottom: 32 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)' }}>805 N Greenwood Ave., Fort Smith, AR, 72901</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)' }}>info@fablabfortsmith.com</div>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 500, textAlign: 'left' }}>
                    <div>
                        <label style={labelStyle}>NAME</label>
                        <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div>
                        <label style={labelStyle}>EMAIL</label>
                        <input className="input" type="email" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                    </div>
                    <div>
                        <label style={labelStyle}>MESSAGE</label>
                        <textarea className="input" rows={4} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 13 }} required value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })} />
                    </div>
                    <motion.div whileHover={{ scale: shouldReduceMotion ? 1 : 1.02 }} whileTap={{ scale: 0.98 }}>
                        <button type="submit" className="btn btn--filled" style={{ width: '100%', fontSize: 12, padding: '12px' }} disabled={status === 'submitting'}>
                            {status === 'submitting' ? 'Sending...' : '$ Submit'}
                        </button>
                    </motion.div>
                </form>
            </div>
        </motion.div>
    );
};

export default ContactSection;
