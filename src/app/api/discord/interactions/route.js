import { NextResponse } from 'next/server';
import nacl from 'tweetnacl';

// Your public key from the Discord developer portal
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

export async function POST(request) {
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text(); // Get raw body as string

    console.log("🔔 Discord Interaction Received:", body.substring(0, 100) + "...");

    if (!PUBLIC_KEY) {
        console.error('DISCORD_PUBLIC_KEY is not set');
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!signature || !timestamp) {
        return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
    }

    // Verify the signature
    try {
        const isVerified = nacl.sign.detached.verify(
            Buffer.from(timestamp + body),
            Buffer.from(signature, 'hex'),
            Buffer.from(PUBLIC_KEY, 'hex')
        );

        if (!isVerified) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
    } catch (err) {
        console.error('Signature verification failed:', err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse the body
    const interaction = JSON.parse(body);

    // 1. Handle PING (Required by Discord)
    if (interaction.type === 1) {
        return NextResponse.json({ type: 1 });
    }

    // 2. Handle Slash Commands
    if (interaction.type === 2) {
        const { name } = interaction.data;

        if (name === 'ping') {
            return NextResponse.json({
                type: 4, // ChannelMessageWithSource
                data: {
                    content: 'Pong! 🏓',
                },
            });
        }
    }

    return NextResponse.json({ error: 'Unknown interaction type' }, { status: 400 });
}
