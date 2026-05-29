
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(req) {
    const session = await auth();

    // Only staff/admins may pair access cards (SEC-11) — fail closed.
    if (!session || !session.user || !['admin', 'staff'].includes(session.user.role)) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { userId, deviceId } = await req.json();
        
        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 400 });
        }

        const targetDevice = deviceId || 'access-scanner-01'; // Default or from UI

        // Call WebSocket Server. SEC-21: require the URL from env (no hardcoded
        // fallback that could point card pairing at the wrong host).
        const wsServerUrl = process.env.WS_SERVER_URL;
        if (!wsServerUrl) {
            console.error('WS_SERVER_URL is not configured');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const response = await fetch(`${wsServerUrl}/api/v2/pairing/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.SOCKET_API_SECRET || ''}`,
            },
            body: JSON.stringify({
                userId,
                deviceId: targetDevice
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            return NextResponse.json({ error: `WS Server Error: ${errText}` }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('Pairing Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
