const BASE = process.env.NEXT_PUBLIC_URL ? `${process.env.NEXT_PUBLIC_URL}/api/v1` : '/api/v1';

async function apiFetch(path, options = {}) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const headers = { ...options.headers };

    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 && typeof window !== 'undefined') {
        alert('Session expired. Please log in again.');
        window.location.href = '/login';
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text}`);
    }

    return res.json();
}

export default apiFetch;
