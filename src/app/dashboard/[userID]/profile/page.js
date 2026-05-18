'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import UserHeader from '@/app/components/profile/header';
import UserDetailsForm from '@/app/components/profile/details';
import UserImage from '@/app/components/profile/image';
import UsersService from '@/services/users';
import MembershipTab from '@/app/components/profile/tabs/membership';
import PublicProfileTab from '@/app/components/profile/tabs/publicProfile';
import SettingsTab from '@/app/components/profile/tabs/settings';
import LoadingTerminal from '@/app/components/LoadingTerminal';

const LOADING_STEPS = [
    'Initializing...', 'Loading user data...', 'Fetching membership plans...',
    'Connecting to database...', 'Retrieving session information...', 'Ready.',
];

function StatusToast({ status, onClose }) {
    if (!status) return null;
    const color = status.type === 'success' ? 'var(--green)' : status.type === 'error' ? 'var(--red)' : 'var(--amber)';
    return (
        <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            border: `1px solid ${color}`, background: 'var(--bg-card)', color,
            padding: '10px 18px', fontSize: 11, fontFamily: 'var(--mono)',
            letterSpacing: '0.06em', zIndex: 200, display: 'flex', gap: 16, alignItems: 'center',
            boxShadow: `0 0 16px ${color}40`, whiteSpace: 'nowrap',
        }}>
            <span>[{status.type.toUpperCase()}]</span>
            <span style={{ color: 'var(--text)' }}>{status.message}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 14 }}>×</button>
        </div>
    );
}

export default function ViewUserPage() {
    const { data: session } = useSession();
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [userID] = useState(params?.userID);
    const [user, setUser] = useState(null);
    const [updatedUser, setUpdatedUser] = useState({});
    const [toast, setToast] = useState(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(parseInt(searchParams.get('tab')) || 0);

    useEffect(() => {
        if (!userID) return;
        UsersService.getUserByQuery({ property: 'userID', value: userID })
            .then(fetchedUser => { setUser(fetchedUser); setUpdatedUser(fetchedUser); })
            .catch(() => setToast({ type: 'error', message: 'Failed to load user data.' }))
            .finally(() => setLoading(false));
    }, [userID]);

    const handleEditChange = (field, value) => {
        setUpdatedUser(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
        setToast({ type: 'warning', message: 'Unsaved changes — save before leaving.' });
    };

    const handleMembershipUpdate = (updatedUserData) => {
        setUser(updatedUserData);
        setUpdatedUser(updatedUserData);
        setToast({ type: 'success', message: 'Membership updated successfully.' });
    };

    const handleSaveChanges = async () => {
        if (!userID) { setToast({ type: 'error', message: 'User ID missing.' }); return; }
        setLoading(true);
        try {
            const dataToSave = { ...updatedUser };
            if (activeTab === 2) {
                dataToSave.profileCompleted = true;
                if (dataToSave.isPublic === undefined) dataToSave.isPublic = true;
            }
            await UsersService.updateUser(userID, dataToSave);
            setToast({ type: 'success', message: 'Profile saved.' });
            setHasChanges(false);
            setUser(dataToSave);
            setUpdatedUser(dataToSave);
        } catch (error) {
            setToast({ type: 'error', message: `Save failed: ${error.message}` });
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <LoadingTerminal steps={LOADING_STEPS} />;

    return (
        <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
            {/* Breadcrumb */}
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 16, display: 'flex', gap: 8 }}>
                <span
                    style={{ color: 'var(--green)', cursor: 'pointer', textDecoration: 'none' }}
                    onClick={() => router.push('/dashboard')}
                >dashboard</span>
                <span>/</span>
                <span>profile</span>
            </div>

            {/* Profile completion nudge */}
            {(!updatedUser?.bio || !updatedUser?.image) && (
                <div style={{ border: '1px solid var(--green)', background: 'rgba(57,255,20,0.05)', padding: '10px 14px', fontSize: 11, color: 'var(--green)', letterSpacing: '0.06em', marginBottom: 20 }}>
                    <span style={{ letterSpacing: '0.1em' }}>[REWARD]</span> Complete your bio and profile picture to earn <strong>10 Stake</strong>.
                </div>
            )}

            {/* Header with tabs */}
            <UserHeader
                onSave={handleSaveChanges}
                hasChanges={hasChanges}
                user={updatedUser}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
            />

            {/* Tab content */}
            <div style={{ marginTop: 24 }}>
                {activeTab === 0 && (
                    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <UserImage
                            picture={updatedUser.image || session?.user?.image}
                            onUpload={(url) => handleEditChange('image', url)}
                            editable
                        />
                        <div style={{ flex: 1, minWidth: 280 }}>
                            <UserDetailsForm user={updatedUser} onEdit={handleEditChange} />
                        </div>
                    </div>
                )}
                {activeTab === 1 && <MembershipTab user={user} onUpdateMembership={handleMembershipUpdate} />}
                {activeTab === 2 && <PublicProfileTab user={updatedUser} onEdit={handleEditChange} setActiveTab={setActiveTab} />}
                {activeTab === 3 && <SettingsTab user={updatedUser} />}
            </div>

            {/* Mobile sticky save button */}
            {hasChanges && (
                <button
                    className="btn btn--filled"
                    onClick={handleSaveChanges}
                    style={{
                        position: 'fixed', bottom: 24, right: 24,
                        fontSize: 11, zIndex: 150,
                        display: 'none',
                    }}
                    id="mobile-save-fab"
                >
                    $ save
                </button>
            )}

            <StatusToast status={toast} onClose={() => setToast(null)} />

            <style>{`
                @media (max-width: 768px) { #mobile-save-fab { display: flex !important; } }
            `}</style>
        </div>
    );
}
