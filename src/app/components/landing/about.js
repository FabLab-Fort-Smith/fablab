"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

const AboutSection = () => {
    const shouldReduceMotion = useReducedMotion();

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.8, ease: "easeOut" }}
            style={{ width: "100%" }}
        >
            <div style={{ padding: '48px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: 'var(--bg)' }}>
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: shouldReduceMotion ? 0 : 0.6 }}
                >
                    <div style={{ fontFamily: 'var(--display)', fontSize: '1.8rem', letterSpacing: '-0.04em', color: 'var(--green)', marginBottom: 24 }}>
                        What is Fab Lab Fort Smith?
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: shouldReduceMotion ? 0 : 0.6 }}
                >
                    <p style={{ maxWidth: 600, fontSize: 16, lineHeight: 1.7, color: 'var(--text)', marginBottom: 32, margin: '0 auto 32px' }}>
                        Fab Lab Fort Smith is a collaborative hackerspace where creativity meets technology. We empower the community by providing access to cutting-edge tools, workshops, and a supportive environment to innovate and grow.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: shouldReduceMotion ? 0 : 0.6 }}
                    whileHover={{ scale: shouldReduceMotion ? 1 : 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <Link href="/about">
                        <button className="btn btn--ghost" style={{ fontSize: 12, padding: '10px 28px' }}>
                            Learn More About Us
                        </button>
                    </Link>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default AboutSection;
