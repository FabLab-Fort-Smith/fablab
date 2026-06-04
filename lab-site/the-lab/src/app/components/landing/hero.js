"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

const HeroSection = () => {
    const [text, setText] = useState("");
    const fullText = "Unleash Your Creativity";

    useEffect(() => {
        let currentIndex = 0;
        const interval = setInterval(() => {
            if (currentIndex <= fullText.length) {
                setText(fullText.slice(0, currentIndex));
                currentIndex++;
            } else {
                clearInterval(interval);
            }
        }, 100);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '64px 24px', background: 'linear-gradient(135deg, var(--bg) 50%, var(--bg-card) 100%)', color: 'var(--text)', minHeight: '90vh', textAlign: 'center', fontFamily: 'var(--mono)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1 }} />

            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(2rem, 6vw, 3.5rem)', letterSpacing: '-0.04em', color: 'var(--green)', marginBottom: 16, textShadow: '0 0 40px rgba(57,255,20,0.3)' }}>
                        {text}
                        <span style={{ display: 'inline-block', width: '1ch', background: 'var(--green)', animation: 'blink 1s step-end infinite' }}>&nbsp;</span>
                    </h1>
                    <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                >
                    <p style={{ maxWidth: 600, fontSize: 'clamp(1rem, 2vw, 1.2rem)', lineHeight: 1.7, color: 'var(--text)', marginBottom: 32 }}>
                        Fort Smith&apos;s Premier Hackerspace. Join a community of creators, builders, and innovators in the River Valley.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                >
                    <Link href="auth/register">
                        <button className="btn btn--filled" style={{ fontSize: 14, padding: '12px 36px', letterSpacing: '0.08em' }}>
                            Join The Community
                        </button>
                    </Link>
                </motion.div>

                <div style={{ marginTop: 16 }}>
                    <Link href="auth/signin">
                        <button className="btn btn--ghost" style={{ fontSize: 12, padding: '8px 20px', borderColor: 'transparent', color: 'var(--green)' }}>
                            Already a member? Login
                        </button>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default HeroSection;
