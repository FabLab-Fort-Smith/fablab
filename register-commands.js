require('dotenv').config({ path: '.env.local' }); // Load env vars
const axios = require('axios');

const DISCORD_APP_ID = process.env.DISCORD_APP_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
// If you want to register guild-specific commands (faster updates), set this.
// Otherwise, leave it null for global commands (can take up to 1 hour to propagate).
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID; 

if (!DISCORD_APP_ID || !DISCORD_BOT_TOKEN) {
    console.error('❌ Missing DISCORD_APP_ID or DISCORD_BOT_TOKEN in .env.local');
    process.exit(1);
}

const commands = [
    {
        name: 'ping',
        description: 'Replies with Pong!',
        type: 1, // CHAT_INPUT
    },
    {
        name: 'tip',
        description: 'Tip stake to another user',
        type: 1,
        options: [
            {
                name: 'user',
                description: 'The user to tip',
                type: 6, // USER
                required: true
            },
            {
                name: 'amount',
                description: 'The amount of stake to tip',
                type: 4, // INTEGER
                required: true,
                min_value: 1
            }
        ]
    }
];

async function registerCommands() {
    try {
        const url = DISCORD_GUILD_ID
            ? `https://discord.com/api/v10/applications/${DISCORD_APP_ID}/guilds/${DISCORD_GUILD_ID}/commands`
            : `https://discord.com/api/v10/applications/${DISCORD_APP_ID}/commands`;

        console.log(`🚀 Registering commands to ${DISCORD_GUILD_ID ? 'Guild ' + DISCORD_GUILD_ID : 'Global'}...`);

        const response = await axios.put(url, commands, {
            headers: {
                Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });

        console.log('✅ Successfully registered commands:');
        response.data.forEach(cmd => console.log(`   - /${cmd.name}`));

    } catch (error) {
        console.error('❌ Failed to register commands:');
        if (error.response) {
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

registerCommands();
