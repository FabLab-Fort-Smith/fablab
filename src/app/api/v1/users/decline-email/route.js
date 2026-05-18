import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import Database from "@/lib/database";
import { sendDeclineEmail } from "@/app/utils/email.util";
import AuthService from "../../auth/[...nextauth]/service.js";

export async function POST(request) {
    try {
        const session = await auth();
        if (!session || session.user.role !== "admin") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { userID } = await request.json();
        if (!userID) {
            return NextResponse.json({ error: "userID is required" }, { status: 400 });
        }

        const db = await Database.getInstance();
        const user = await db.users.findOne({ userID });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const email = AuthService.decryptEmail(user.email);
        await sendDeclineEmail(email, user.firstName);

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error("Error sending decline email:", error);
        return NextResponse.json({ error: "Failed to send decline email" }, { status: 500 });
    }
}
