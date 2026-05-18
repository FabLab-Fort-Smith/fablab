'use client';

import { useState } from 'react';

export default function TestControllerPage() {
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);
    const deviceId = 'door-controller-01';

    const handleToggle = async () => {
        setLoading(true);
        setStatus('Sending command...');
        try {
            const res = await fetch('/api/test-toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId }),
            });
            const data = await res.json();
            setStatus(res.ok ? `Success: ${data.message}` : `Error: ${data.error}`);
        } catch (error) {
            setStatus(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const isError = status.startsWith('Error');

    return (
        <div style={{ padding: '32px 24px', maxWidth: 480, margin: '0 auto' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                <span style={{ color: 'var(--green)' }}>$</span> ./test-controller --debug
            </div>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: '1.4rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 24 }}>
                Controller Test
            </h1>

            <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '24px 20px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 20 }}>
                    Device ID:{' '}
                    <code style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--cyan)', background: 'var(--bg-1)', padding: '2px 6px' }}>
                        {deviceId}
                    </code>
                </div>

                <button
                    onClick={handleToggle}
                    disabled={loading}
                    className="btn btn--filled"
                    style={{ width: '100%', fontSize: 12 }}
                >
                    {loading ? '$ sending...' : '$ toggle light'}
                </button>

                {status && (
                    <div style={{ marginTop: 16, padding: '10px 14px', border: `1px solid ${isError ? 'var(--red)' : 'var(--green)'}`, color: isError ? 'var(--red)' : 'var(--green)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
}
