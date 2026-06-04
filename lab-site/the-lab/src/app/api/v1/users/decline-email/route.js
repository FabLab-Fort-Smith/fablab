import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { sendDeclineEmail } from "@/app/utils/email.util";
import UserService from "../service";

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

        const user = await UserService.getUserByQuery({ userID });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        await sendDeclineEmail(user.email, user.firstName);

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error("Error sending decline email:", error);
        return NextResponse.json({ error: "Failed to send decline email" }, { status: 500 });
    }
}
