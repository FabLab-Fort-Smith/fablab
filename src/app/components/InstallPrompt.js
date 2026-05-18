"use client";
import React, { useState, useEffect } from 'react';

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [open, setOpen] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            setIsStandalone(true);
        }

        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        setIsIOS(ios);

        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            const hasDismissed = localStorage.getItem('installPromptDismissed');
            if (!hasDismissed) setOpen(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    useEffect(() => {
        if (isIOS && !isStandalone) {
            const hasDismissed = localStorage.getItem('installPromptDismissed');
            if (!hasDismissed) setOpen(true);
        }
    }, [isIOS, isStandalone]);

    const handleInstall = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') setDeferredPrompt(null);
            setOpen(false);
        }
    };

    const handleClose = () => {
        setOpen(false);
        localStorage.setItem('installPromptDismissed', 'true');
    };

    if (isStandalone || !open) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '24px 28px', maxWidth: 360, width: '100%', position: 'relative' }}>
                <button onClick={handleClose} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>

                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <img src="/logos/icon.png" alt="App Icon" style={{ width: 56, height: 56, marginBottom: 12 }} />
                    <div style={{ fontFamily: 'var(--display)', fontSize: '1.2rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 4 }}>Install The Lab App</div>
                    <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>Install our app for a better experience, easier access, and push notifications!</div>
                </div>

                {isIOS && (
                    <div style={{ border: '1px solid var(--bd)', padding: '10px 14px', marginBottom: 16, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-mid)' }}>
                        <div style={{ color: 'var(--text-bright)', marginBottom: 6 }}>// TO INSTALL ON IOS:</div>
                        <div style={{ marginBottom: 4 }}>1. Tap the Share button ↑</div>
                        <div>2. Tap "Add to Home Screen"</div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn--ghost btn--sm" style={{ flex: 1, fontSize: 10 }} onClick={handleClose}>maybe later</button>
                    {!isIOS && (
                        <button className="btn btn--filled btn--sm" style={{ flex: 1, fontSize: 10 }} onClick={handleInstall}>↓ install</button>
                    )}
                </div>
            </div>
        </div>
    );
}
