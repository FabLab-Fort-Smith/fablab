// src/app/api/auth/signin/route.js
import AuthService from '../[...nextauth]/service';
import { NextResponse } from 'next/server';

export const runtime = "nodejs";

export async function POST(req) {
    try {
        const { identifier, password } = await req.json();  
        const userData = await AuthService.login(identifier, password);  // Now uses identifier

        if (!userData) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        // ✅ Return the entire user data for NextAuth handling
        return NextResponse.json(userData, { status: 200 });
    } catch (error) {
        console.error("Signin error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

