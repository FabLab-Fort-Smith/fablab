"use client";

import { motion, useReducedMotion } from "motion/react";

const MembershipSection = () => {
    const shouldReduceMotion = useReducedMotion();

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, ease: "easeOut" }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '48px 24px', background: 'var(--bg)' }}>
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: shouldReduceMotion ? 0 : 0.6 }}
                >
                    <div style={{ fontFamily: 'var(--display)', fontSize: '1.8rem', letterSpacing: '-0.04em', color: 'var(--green)', marginBottom: 16 }}>
                        Join Our Discord Community
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: shouldReduceMotion ? 0 : 0.6 }}
                >
                    <p style={{ maxWidth: 600, fontSize: 15, lineHeight: 1.7, color: 'var(--text)', marginBottom: 32, margin: '0 auto 32px' }}>
                        Stay updated with the latest news, events, and connect with fellow creators. Join our Discord community to get support and be part of the conversation!
                    </p>
                </motion.div>

                <motion.div
                    whileHover={{ scale: shouldReduceMotion ? 1 : 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <button
                        className="btn btn--filled"
                        style={{ fontSize: 13, padding: '12px 32px' }}
                        onClick={() => window.open("/api/v1/discord/invite", "_blank")}
                    >
                        Join Our Discord
                    </button>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default MembershipSection;
