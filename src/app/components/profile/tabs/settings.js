"use client";
import React, { useState } from 'react';
import { signIn } from 'next-auth/react';

const SettingsTab = ({ user }) => {
    const [passwordModal, setPasswordModal] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [privacySettings, setPrivacySettings] = useState({
        showEmail: user.privacy?.showEmail ?? true,
        showDiscord: user.privacy?.showDiscord ?? true,
        showPhone: user.privacy?.showPhone ?? false
    });
    const [notificationSettings, setNotificationSettings] = useState({
        email: user.notificationPreferences?.email ?? false,
        discord: user.notificationPreferences?.discord ?? false
    });
    const [mergeModal, setMergeModal] = useState(false);
    const [legacyEmail, setLegacyEmail] = useState('');
    const [legacyPassword, setLegacyPassword] = useState('');
    const [legacyUser, setLegacyUser] = useState(null);
    const [mergeStep, setMergeStep] = useState(0);
    const [mergeOverrides, setMergeOverrides] = useState({});
    const [verifying, setVerifying] = useState(false);
    const [merging, setMerging] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'info') => { setToast({ message, type }); setTimeout(() => setToast(null), 4000); };

    const handlePrivacyChange = async (setting) => {
        const newSettings = { ...privacySettings, [setting]: !privacySettings[setting] };
        setPrivacySettings(newSettings);
        const res = await fetch(`/api/v1/users?userID=${user.userID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ privacy: newSettings }) });
        if (res.ok) showToast("Privacy settings updated.", 'success');
        else { showToast("Failed to update privacy settings.", 'error'); setPrivacySettings(privacySettings); }
    };

    const handleNotificationChange = async (setting) => {
        const newSettings = { ...notificationSettings, [setting]: !notificationSettings[setting] };
        setNotificationSettings(newSettings);
        const res = await fetch(`/api/v1/users?userID=${user.userID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationPreferences: newSettings }) });
        if (res.ok) showToast("Notification preferences updated.", 'success');
        else { showToast("Failed to update notification preferences.", 'error'); setNotificationSettings(notificationSettings); }
    };

    const handleSubmitPasswordChange = async () => {
        if (passwordForm.newPassword !== passwordForm.confirmPassword) { showToast("New passwords do not match.", 'error'); return; }
        const res = await fetch('/api/v1/users/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: user.userID, currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }) });
        const data = await res.json();
        if (res.ok) { showToast("Password updated successfully!", 'success'); setPasswordModal(false); setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); }
        else showToast(data.error || "Failed to update password.", 'error');
    };

    const handleVerifyLegacyUser = async () => {
        if (!legacyEmail || !legacyPassword) { showToast("Please enter email and password.", 'error'); return; }
        if (legacyEmail === user.email) { showToast("You cannot merge your current account into itself.", 'error'); return; }
        setVerifying(true);
        const res = await fetch('/api/v1/users/verify-credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: legacyEmail, password: legacyPassword }) });
        const data = await res.json();
        if (data.success) {
            setLegacyUser(data.user);
            setMergeStep(1);
            const init = {};
            ['firstName', 'lastName', 'bio', 'image'].forEach(f => { init[f] = 'target'; });
            setMergeOverrides(init);
        } else showToast(data.error || "Verification failed.", 'error');
        setVerifying(false);
    };

    const handleMergeSubmit = async () => {
        if (!legacyUser) return;
        if (!confirm(`Are you sure you want to merge ${legacyUser.email} into your current account? The legacy account will be deleted.`)) return;
        setMerging(true);
        // Re-send the legacy credentials so the server can verify ownership of the
        // source account before merging + deleting it (a non-admin self-merge).
        const res = await fetch('/api/v1/users/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserID: user.userID, sourceUserID: legacyUser.userID, overrides: mergeOverrides, sourceEmail: legacyEmail, sourcePassword: legacyPassword }) });
        const data = await res.json();
        if (data.success) { showToast("Accounts merged successfully! Reloading...", 'success'); setTimeout(() => window.location.reload(), 1500); }
        else showToast(data.error || "Merge failed.", 'error');
        setMerging(false);
    };

    const Toggle = ({ checked, onChange }) => (
        <div onClick={onChange} style={{ width: 36, height: 20, background: checked ? 'var(--green)' : 'var(--bg-1)', border: '1px solid var(--bd)', borderRadius: 10, cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 14, height: 14, background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
        </div>
    );

    const Section = ({ title, children }) => (
        <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 12 }}>{title}</div>
            <div style={{ border: '1px solid var(--bd)', padding: '16px 20px' }}>{children}</div>
        </div>
    );

    const labelStyle = { display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 };

    return (
        <div style={{ padding: '20px 24px' }}>
            {toast && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, border: `1px solid ${toast.type === 'error' ? 'var(--red)' : toast.type === 'success' ? 'var(--green)' : 'var(--cyan)'}`, color: toast.type === 'error' ? 'var(--red)' : toast.type === 'success' ? 'var(--green)' : 'var(--cyan)', background: 'var(--bg-card)', padding: '10px 20px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {toast.message}
                </div>
            )}

            <Section title="// SECURITY SETTINGS">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 13, color: 'var(--text-bright)', marginBottom: 4 }}>Password</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Change your password to keep your account secure.</div>
                    </div>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setPasswordModal(true)}>Change Password</button>
                </div>
            </Section>

            <Section title="// PRIVACY SETTINGS">
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>Control what contact information is visible on your public profile.</div>
                {[['showEmail', 'Show Email Address'], ['showDiscord', 'Show Discord Handle'], ['showPhone', 'Show Phone Number']].map(([key, label]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <Toggle checked={privacySettings[key]} onChange={() => handlePrivacyChange(key)} />
                        <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
                    </div>
                ))}
            </Section>

            <Section title="// NOTIFICATION PREFERENCES">
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>Manage how you receive notifications from The Lab.</div>
                {[['email', 'Email Notifications'], ['discord', 'Discord DM Notifications']].map(([key, label]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <Toggle checked={notificationSettings[key]} onChange={() => handleNotificationChange(key)} />
                        <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
                    </div>
                ))}
            </Section>

            <Section title="// INTEGRATIONS">
                {[
                    { name: 'Discord', desc: 'Link your Discord account to access the FabLab bot and community features.', connected: !!user.discordHandle, handle: user.discordHandle, onConnect: async () => { try { await fetch('/api/v1/auth/link-intent', { method: 'POST' }); } catch(e) {} signIn('discord', { callbackUrl: `/dashboard/${user.userID}/profile?tab=3` }); }, onDisconnect: async () => { if (!confirm('Disconnect your Discord account?')) return; const res = await fetch(`/api/v1/users?userID=${user.userID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discordId: '', discordHandle: '', discordLinked: false }) }); if (res.ok) { showToast('Discord disconnected.', 'success'); setTimeout(() => window.location.reload(), 1200); } else showToast('Failed to disconnect Discord.', 'error'); } },
                    { name: 'Google', desc: 'Link your Google account for easier login.', connected: !!user.googleId, handle: null, onConnect: () => signIn('google', { callbackUrl: `/dashboard/${user.userID}/profile?tab=3` }), onDisconnect: null },
                ].map(({ name, desc, connected, handle, onConnect, onDisconnect }, i) => (
                    <div key={name}>
                        {i > 0 && <div style={{ borderTop: '1px solid var(--bd)', margin: '16px 0' }} />}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 13, color: 'var(--text-bright)', marginBottom: 4 }}>{name}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{desc}</div>
                                {connected && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 8px', display: 'inline-block' }}>✓ {handle ? `Connected as: ${handle}` : 'Connected'}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn--sm" style={{ fontSize: 10, borderColor: connected ? 'var(--amber)' : 'var(--green)', color: connected ? 'var(--amber)' : 'var(--green)' }} onClick={onConnect}>
                                    {connected ? `Reconnect ${name}` : `Connect ${name}`}
                                </button>
                                {connected && onDisconnect && (
                                    <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={onDisconnect}>
                                        Disconnect
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </Section>

            <Section title="// MERGE LEGACY ACCOUNT">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 13, color: 'var(--text-bright)', marginBottom: 4 }}>Merge Old Account</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Have an old account you want to merge into this one? This will move your history, hours, and items here.</div>
                    </div>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10, borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={() => setMergeModal(true)}>Merge Account</button>
                </div>
            </Section>

            {/* Change Password Modal */}
            {passwordModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '24px 28px', maxWidth: 440, width: '100%' }}>
                        <div style={{ fontFamily: 'var(--display)', fontSize: '1.1rem', letterSpacing: '-0.04em', color: 'var(--green)', marginBottom: 20 }}>Change Password</div>
                        {[['currentPassword', 'CURRENT PASSWORD'], ['newPassword', 'NEW PASSWORD'], ['confirmPassword', 'CONFIRM NEW PASSWORD']].map(([key, label]) => (
                            <div key={key} style={{ marginBottom: 16 }}>
                                <label style={labelStyle}>{label}</label>
                                <input className="input" type="password" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={passwordForm[key]} onChange={e => setPasswordForm({ ...passwordForm, [key]: e.target.value })} />
                            </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setPasswordModal(false)}>cancel</button>
                            <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleSubmitPasswordChange}>$ update password</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Merge Modal */}
            {mergeModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '24px 28px', maxWidth: 560, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ fontFamily: 'var(--display)', fontSize: '1.1rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 20 }}>Merge Legacy Account</div>
                        {mergeStep === 0 ? (
                            <>
                                <div style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 20 }}>Enter the credentials of the <strong>OLD</strong> account you want to merge. The old account will be deleted after the merge.</div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={labelStyle}>EMAIL OF OLD ACCOUNT</label>
                                    <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={legacyEmail} onChange={e => setLegacyEmail(e.target.value)} />
                                </div>
                                <div style={{ marginBottom: 20 }}>
                                    <label style={labelStyle}>PASSWORD OF OLD ACCOUNT</label>
                                    <input className="input" type="password" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={legacyPassword} onChange={e => setLegacyPassword(e.target.value)} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setMergeModal(false)}>cancel</button>
                                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleVerifyLegacyUser} disabled={verifying}>{verifying ? 'verifying...' : '$ verify & continue'}</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ border: '1px solid var(--amber)', color: 'var(--amber)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 20 }}>
                                    ⚠ Conflict Resolution — choose which data to keep.<br />
                                    <strong>Current:</strong> {user.email} | <strong>Legacy:</strong> {legacyUser.email}
                                </div>
                                {['firstName', 'lastName', 'bio'].map(field => (
                                    <div key={field} style={{ border: '1px solid var(--bd)', padding: '12px 16px', marginBottom: 12 }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: '0.1em' }}>{field.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}</div>
                                        {[['target', 'Keep Current', user[field]], ['source', 'Use Legacy', legacyUser[field]]].map(([val, label, preview]) => (
                                            <label key={val} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8, cursor: 'pointer' }}>
                                                <input type="radio" style={{ marginTop: 2 }} checked={mergeOverrides[field] === val} onChange={() => setMergeOverrides({ ...mergeOverrides, [field]: val })} />
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)' }}>{label}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{preview || '(Empty)'}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setMergeModal(false)}>cancel</button>
                                    <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={handleMergeSubmit} disabled={merging}>{merging ? 'merging...' : '$ confirm merge'}</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsTab;
