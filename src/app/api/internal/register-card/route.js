// src/app/api/internal/register-card/route.js
import { NextResponse } from 'next/server';
import UserService from '@/app/api/v1/users/service';
import { API_SECRET_KEY } from '@/lib/constants'; // Needs to be added or hardcoded for now

// Simple shared secret check
const SECRET = process.env.INTERNAL_API_SECRET || 'super-secure-internal-secret-882';

export async function POST(req) {
    try {
        const authHeader = req.headers.get('authorization');
        if (authHeader !== `Bearer ${SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { userId, cardId } = await req.json();

        if (!userId || !cardId) {
            return NextResponse.json({ error: 'Missing userId or cardId' }, { status: 400 });
        }

        console.log(`[Internal API] Registering Card ${cardId} for User ${userId}`);

        // Update User
        // Note: Check UserModel structure. Assuming membership.accessKey.id is the place
        // Or create a new field "rfidTag"
        // Based on MemberDialog.js logic: membership.accessKey.issued is a boolean.
        
        const updateData = {
            'membership.accessKey.issued': true,
            'membership.accessKey.code': cardId, // Storing the UID here
            'membership.accessKey.issuedAt': new Date().toISOString()
        };

        const updatedUser = await UserService.updateUser(userId, updateData);

        if (!updatedUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, userId: updatedUser.userID });

    } catch (error) {
        console.error("Register Card Error:", error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
