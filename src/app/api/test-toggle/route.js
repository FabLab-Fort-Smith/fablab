import { toggleLight } from '@/lib/access-control';
import { NextResponse } from 'next/server';
import { guardOperationalEndpoint } from '@/lib/adminGuard';

export async function POST(request) {
  try {
    // SEC-18: hardware test endpoint — admin-only and never reachable in production.
    const blocked = await guardOperationalEndpoint({ productionDisabled: true });
    if (blocked) return blocked;

    const body = await request.json();
    const { deviceId } = body;

    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID is required' }, { status: 400 });
    }

    const result = await toggleLight(deviceId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Test toggle error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
