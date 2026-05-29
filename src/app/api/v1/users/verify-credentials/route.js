import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import UserModel from '@/app/api/auth/[...nextauth]/model';
import AuthService from '@/app/api/auth/[...nextauth]/service';
import bcrypt from 'bcryptjs';

export async function POST(request) {
    try {
        // SEC-02: require a session — this endpoint verifies a legacy account's
        // password during account linking and must not be an open credential
        // (and user-enumeration) oracle for anonymous callers.
        const session = await auth();
        if (!session?.user?.userID) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ success: false, error: 'Email and password are required' }, { status: 400 });
        }

        const encryptedEmail = AuthService.encryptEmail(email);
        const user = await UserModel.findByEmail(encryptedEmail);

        if (!user) {
            return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
        }

        // Decrypt sensitive fields before returning
        user.email = AuthService.decryptEmail(user.email);
        if (user.phoneNumber) {
            user.phoneNumber = AuthService.decryptPhone(user.phoneNumber);
        }

        // Return safe user object
        const safeUser = {
            userID: user.userID,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            image: user.image,
            bio: user.bio,
            provider: user.provider,
            stake: user.stake,
            role: user.role
        };

        return NextResponse.json({ success: true, user: safeUser });

    } catch (error) {
        console.error('Error verifying credentials:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
