import React from 'react';

const JackpotDisplay = ({ amount }) => {
    return (
        <div style={{ padding: '20px 24px', textAlign: 'center', background: 'linear-gradient(135deg, #000000 0%, #0a0f0a 100%)', border: '2px solid var(--green)', boxShadow: '0 0 15px rgba(57,255,20,0.2)', marginBottom: 24 }}>
            <div style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em', marginBottom: 8 }}>WEEKLY JACKPOT</div>
            <div style={{ color: 'var(--text-bright)', fontFamily: 'var(--mono)', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 700, textShadow: '0 0 10px var(--green), 0 0 20px var(--green)' }}>
                {typeof amount === 'number' ? amount.toFixed(2) : amount} STAKE
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.1em', marginTop: 6 }}>Resets Sunday Midnight</div>
        </div>
    );
};

export default JackpotDisplay;
