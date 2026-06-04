import React from 'react';

const UserDetailsForm = ({ user, onEdit }) => {
    const labelStyle = { display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 };
    const fieldWrap = { marginBottom: 16 };

    return (
        <div style={{ flex: 1, padding: '20px 24px', background: 'var(--bg-card)', color: 'var(--text)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 600 }}>
                <div style={fieldWrap}>
                    <label style={labelStyle}>FIRST_NAME</label>
                    <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={user.firstName || ''} onChange={e => onEdit('firstName', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                    <label style={labelStyle}>LAST_NAME</label>
                    <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={user.lastName || ''} onChange={e => onEdit('lastName', e.target.value)} />
                </div>
                <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>USERNAME (@)</label>
                    <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={user.username || ''} onChange={e => onEdit('username', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                    <label style={labelStyle}>EMAIL</label>
                    <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={user.email || ''} onChange={e => onEdit('email', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                    <label style={labelStyle}>PHONE_NUMBER</label>
                    <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={user.phoneNumber || ''} onChange={e => onEdit('phoneNumber', e.target.value)} />
                </div>
            </div>
        </div>
    );
};

export default UserDetailsForm;
