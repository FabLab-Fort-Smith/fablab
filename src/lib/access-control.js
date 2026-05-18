const ACCESS_CONTROL_API_URL = process.env.ACCESS_CONTROL_API_URL || 'http://localhost:3001';

export async function unlockDoor(deviceId) {
    try {
        const res = await fetch(`${ACCESS_CONTROL_API_URL}/api/unlock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
            headers: { 'Content-Type': 'application/json' },
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
        const res = await fetch(`${ACCESS_CONTROL_API_URL}/api/status/${deviceId}`);
        if (!res.ok) return false;
        const data = await res.json();
        return data.connected;
    } catch (error) {
        console.error('Error checking device status:', error.message);
        return false;
    }
}
