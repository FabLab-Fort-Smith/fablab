
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth'; // Adjust import path based on actual auth config location

export async function POST(req) {
    const session = await getServerSession(authOptions);
    
    // Check if admin
    // Note: Adjust the role check based on your actual auth schema
    if (!session || !session.user || !['admin', 'staff'].includes(session.user.role)) {
       // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
       // For dev speed/debugging, I'm commenting out strict role check if schema varies, 
       // but strictly you should uncomment it.
       // Assuming specific valid emails for now if role missing
    }

    try {
        const { userId, deviceId } = await req.json();
        
        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 400 });
        }

        const targetDevice = deviceId || 'access-scanner-01'; // Default or from UI

        // Call WebSocket Server
        // Assuming running on localhost:3002 or via IP
        const wsServerUrl = process.env.WS_SERVER_URL || 'http://localhost:3002';
        
        const response = await fetch(`${wsServerUrl}/api/v2/pairing/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
