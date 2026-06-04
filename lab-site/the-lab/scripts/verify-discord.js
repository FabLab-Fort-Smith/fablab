require('dotenv').config({ path: '.env.local', quiet: true });

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_BOUNTY_CHANNEL_ID;

async function verifyDiscordPermissions() {
    console.log(`Testing Discord Permissions...`);
    console.log(`Channel ID: ${CHANNEL_ID}`);

    if (!DISCORD_BOT_TOKEN) {
        console.error("❌ Missing DISCORD_BOT_TOKEN");
        return;
    }

    // 1. Check if we can see the channel
    console.log("\n1. Checking Channel Access...");
    const channelRes = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}`, {
        headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`
        }
    });

    if (!channelRes.ok) {
        const err = await channelRes.json();
        console.error(`❌ Failed to fetch channel: ${channelRes.status} ${channelRes.statusText}`);
        console.error(JSON.stringify(err, null, 2));
        if (channelRes.status === 404) console.log("👉 Hint: The bot might not be in the server, or the channel ID is wrong.");
        if (channelRes.status === 403) console.log("👉 Hint: The bot does not have 'View Channel' permission.");
        return;
    }

    const channel = await channelRes.json();
    console.log(`✅ Found Channel: #${channel.name} (Type: ${channel.type})`);
    console.log(`   Guild ID: ${channel.guild_id}`);

    // 2. Try to send a message
    console.log("\n2. Attempting to Send Message...");
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
        method: 'POST',
        headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            content: "✅ Permission Check: The bot can send messages to this channel."
        })
    });

    if (!msgRes.ok) {
        const err = await msgRes.json();
        console.error(`❌ Failed to send message: ${msgRes.status} ${msgRes.statusText}`);
        console.error(JSON.stringify(err, null, 2));
        
        if (err.code === 50013) {
            console.log("\n⚠️  DIAGNOSIS: MISSING PERMISSIONS (Code 50013)");
            console.log("The bot can SEE the channel, but cannot WRITE to it.");
            console.log("Possible fixes:");
            console.log("1. Go to the channel settings in Discord.");
            console.log("2. Click 'Permissions'.");
            console.log("3. Add the Bot (or its role) and check 'Send Messages' and 'Embed Links'.");
            console.log("4. Alternatively, kick the bot and re-invite it with the 'Administrator' permission for testing.");
        }
    } else {
        console.log("✅ Success! Message sent.");
    }
}

verifyDiscordPermissions();
