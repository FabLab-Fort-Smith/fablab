import NotificationService from './service';
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

// SEC-14: notifications are per-user private data. The owner is always derived
// from the session — never from a client-supplied `userID` — so a caller can
// only read/mutate their own notifications. Creation (which can also fan out to
// email/Discord) is admin-only over HTTP; app flows create notifications via
// NotificationService.create() server-side, not through this endpoint.

export async function GET(req) {
    try {
        const session = await auth();
        if (!session?.user?.userID) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const notifications = await NotificationService.getUserNotifications(session.user.userID);
        return NextResponse.json({ notifications }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const session = await auth();
        if (!session?.user?.userID) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (session.user.role !== 'admin') {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const notification = await NotificationService.create(body);
        return NextResponse.json({ notification }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(req) {
    try {
        const session = await auth();
        if (!session?.user?.userID) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userID = session.user.userID;

        const { action, notificationID } = await req.json();

        if (action === 'markRead' && notificationID) {
            await NotificationService.markRead(notificationID, userID);
            return NextResponse.json({ success: true }, { status: 200 });
        }

        if (action === 'markAllRead') {
            await NotificationService.markAllRead(userID);
            return NextResponse.json({ success: true }, { status: 200 });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
