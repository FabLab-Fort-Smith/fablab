"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

const Testimonials = ({ testimonials = [] }) => {
    const shouldReduceMotion = useReducedMotion();
    const [current, setCurrent] = useState(0);

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, ease: "easeOut" }}
        >
            <div style={{ padding: '48px 24px', background: 'var(--bg-card)', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '1.8rem', letterSpacing: '-0.04em', color: 'var(--green)', marginBottom: 32 }}>
                    What Our Members Are Saying
                </div>

                {testimonials.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)', padding: '24px 0' }}>
                        No testimonials yet. Be the first to share your experience!
                    </div>
                ) : (
                    <>
                        <div style={{ border: '1px solid var(--bd)', background: 'var(--bg)', padding: '28px 32px', maxWidth: 600, margin: '0 auto' }}>
                            <motion.div
                                key={current}
                                initial={{ opacity: 0, x: 100 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -100 }}
                                transition={{ duration: shouldReduceMotion ? 0 : 0.6 }}
                            >
                                <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text)', marginBottom: 16 }}>
                                    &quot;{testimonials[current].quote}&quot;
                                </div>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>
                                    — {testimonials[current].name}
                                </div>
                            </motion.div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 20 }}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setCurrent(p => p === 0 ? testimonials.length - 1 : p - 1)}>
                                ‹ Previous
                            </button>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setCurrent(p => (p + 1) % testimonials.length)}>
                                Next ›
                            </button>
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    );
};

export default Testimonials;
