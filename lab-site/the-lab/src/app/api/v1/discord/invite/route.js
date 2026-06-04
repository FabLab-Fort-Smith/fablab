import { NextResponse } from "next/server";
import DiscordService from "@/lib/discord";

export const runtime = "nodejs";

export async function GET() {
    try {
        // 1. Fetch all channels
        const channels = await DiscordService.getGuildChannels();
        
        if (!channels || channels.length === 0) {
            return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
        }

        // 2. Find a suitable channel (Type 0 = GUILD_TEXT)
        // Prefer 'general', 'welcome', 'announcements', or just the first text channel
        const targetChannel = channels.find(c => c.type === 0 && (c.name.includes('general') || c.name.includes('welcome'))) 
                           || channels.find(c => c.type === 0);

        if (!targetChannel) {
            return NextResponse.json({ error: "No suitable text channel found for invite" }, { status: 404 });
        }

        // 3. Create Invite (max_age: 0 = never expires, unique: false = reuse existing if possible)
        const invite = await DiscordService.createInvite(targetChannel.id, {
            max_age: 0, // Never expires
            max_uses: 0, // Unlimited uses
            unique: false 
        });

        if (!invite || !invite.code) {
            return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
        }

        // 4. Redirect user to the invite URL
        const inviteUrl = `https://discord.gg/${invite.code}`;
        return NextResponse.redirect(inviteUrl);

    } catch (error) {
        console.error("Error generating Discord invite:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
