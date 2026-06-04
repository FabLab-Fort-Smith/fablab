import React from 'react';

export default function StakeLedger({ stakeHistory = [], currentStake = 0 }) {
    return (
        <div style={{ maxWidth: 935, margin: '0 auto', padding: '16px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 16 }}>
                <div style={{ width: 44, height: 44, border: '1px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)', fontSize: 20 }}>◈</div>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-bright)' }}>Stake Ledger</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>Current Balance: {currentStake} Stake</div>
                </div>
            </div>

            {stakeHistory.length > 0 ? (
                <table className="term-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', borderBottom: '1px solid var(--bd)', fontWeight: 400 }}>DATE</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', borderBottom: '1px solid var(--bd)', fontWeight: 400 }}>REASON</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', borderBottom: '1px solid var(--bd)', fontWeight: 400 }}>AMOUNT</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stakeHistory.slice().reverse().map((tx, index) => (
                            <tr key={index} style={{ borderBottom: '1px solid var(--bg-1)' }}>
                                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-mid)', fontFamily: 'var(--mono)' }}>
                                    {new Date(tx.timestamp).toLocaleDateString()} {new Date(tx.timestamp).toLocaleTimeString()}
                                </td>
                                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text)' }}>{tx.reason}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: tx.amount >= 0 ? 'var(--green)' : 'var(--red)', border: `1px solid ${tx.amount >= 0 ? 'var(--green)' : 'var(--red)'}`, padding: '2px 8px' }}>
                                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                    No transactions found. Start exploring the lab to earn stake!
                </div>
            )}
        </div>
    );
}
