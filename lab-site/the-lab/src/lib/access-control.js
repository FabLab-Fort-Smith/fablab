// SEC-21: no hardcoded fallback — the access-control (socket-server) URL must
// come from the environment. Resolved per call so a missing config fails loudly
// instead of silently pointing device control at localhost.
function controlApiUrl() {
    const url = process.env.ACCESS_CONTROL_API_URL;
    if (!url) throw new Error('ACCESS_CONTROL_API_URL is not configured');
    return url;
}

// Bearer secret for the socket server's control endpoints (SEC-05). SEC-21: require it from
// the environment (no empty `|| ''` fallback) so a missing secret fails closed/loudly instead
// of sending an empty bearer — mirrors controlApiUrl() above.
function socketApiSecret() {
    const secret = process.env.SOCKET_API_SECRET;
    if (!secret) throw new Error('SOCKET_API_SECRET is not configured');
    return secret;
}

// Readiness probe (no throw): true only when both the socket-server URL and its
// control secret are configured. Used by the door-access-controller plugin's
// checkReady() so the platform refuses to enable a door feature that can't reach
// any device — mirrors purelymailReady() (no `|| ''` fallbacks; SEC-21).
export function accessControlReady() {
    return Boolean(process.env.ACCESS_CONTROL_API_URL && process.env.SOCKET_API_SECRET);
}

function authHeaders(extra = {}) {
    return {
        ...extra,
        Authorization: `Bearer ${socketApiSecret()}`,
    };
}

export async function unlockDoor(deviceId) {
    try {
        const res = await fetch(`${controlApiUrl()}/api/unlock`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ deviceId }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to unlock door');
        }
        return res.json();
    } catch (error) {
        console.error('Error unlocking door:', error.message);
        throw new Error(error.message || 'Failed to unlock door');
    }
}

export async function toggleLight(deviceId) {
    try {
        const res = await fetch(`${controlApiUrl()}/api/toggle-light`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ deviceId }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to toggle light');
        }
        return res.json();
    } catch (error) {
        console.error('Error toggling light:', error.message);
        throw new Error(error.message || 'Failed to toggle light');
    }
}

export async function getDeviceStatus(deviceId) {
    try {
        const res = await fetch(`${controlApiUrl()}/api/status/${deviceId}`, {
            headers: authHeaders(),
        });
        if (!res.ok) return false;
        const data = await res.json();
        return data.connected;
    } catch (error) {
        console.error('Error checking device status:', error.message);
        return false;
    }
}
