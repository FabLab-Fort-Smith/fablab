const ACCESS_CONTROL_API_URL = process.env.ACCESS_CONTROL_API_URL || 'http://localhost:3001';

// Bearer secret for the socket server's control endpoints (SEC-05). The server
// rejects requests that don't carry it, so device control is no longer open.
function authHeaders(extra = {}) {
    return {
        ...extra,
        Authorization: `Bearer ${process.env.SOCKET_API_SECRET || ''}`,
    };
}

export async function unlockDoor(deviceId) {
    try {
        const res = await fetch(`${ACCESS_CONTROL_API_URL}/api/unlock`, {
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
        const res = await fetch(`${ACCESS_CONTROL_API_URL}/api/toggle-light`, {
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
        const res = await fetch(`${ACCESS_CONTROL_API_URL}/api/status/${deviceId}`, {
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
