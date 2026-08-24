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

// Push a signed offline allowlist snapshot to the socket-server (door-access addon, Flow C).
// The socket-server stores it and decides locally when the app core is unreachable.
export async function pushAllowlist(signed) {
    const res = await fetch(`${controlApiUrl()}/api/v2/allowlist`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(signed),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to push allowlist');
    }
    return res.json().catch(() => ({}));
}

// Push a batch of per-door SIGNED envelopes for one broker to the socket-server, which relays them
// down that broker's live uplink (door-controller-wifi.md §13 S2c; the cloud side is #157). A broker
// that isn't currently connected returns 503 — that is NOT an error to retry forever: the broker
// re-syncs on reconnect, so we surface it as { connected:false } for the caller to note and move on.
// Returns { connected, relayed, rejected }. Throws only on a real transport/4xx failure.
export async function pushBrokerEnvelopes(brokerId, envelopes) {
    if (typeof brokerId !== 'string' || !brokerId) throw new Error('brokerId is required');
    // Bound each push so a hung relay can't stall the admin/event path that awaits this across every
    // broker (topic-reliability: timeout on every network call). 5s is generous for a small batch.
    const res = await fetch(`${controlApiUrl()}/api/v2/broker/${encodeURIComponent(brokerId)}/envelopes`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(Array.isArray(envelopes) ? envelopes : []),
        signal: AbortSignal.timeout(5000),
    });
    if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        return { connected: false, relayed: 0, rejected: data.rejected || 0 };
    }
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to push broker envelopes');
    }
    const data = await res.json().catch(() => ({}));
    return { connected: true, relayed: data.relayed || 0, rejected: data.rejected || 0 };
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
