require('dotenv').config({ path: '.env.local', quiet: true });
const axios = require('axios');

const commands = [
    {
        name: 'ping',
        description: 'Replies with Pong!',
    },
    {
        name: 'help',
        description: 'List all available commands',
    },
    {
        name: 'checkin',
        description: 'Check in or out of the lab',
    },
    {
        name: 'profile',
        description: 'View your FabLab profile',
    },
    {
        name: 'balance',
        description: 'Check your Stake balance',
    },
    {
        name: 'badges',
        description: 'View your earned badges',
    },
    {
        name: 'leaderboard',
        description: 'See the top Stake holders',
    },
    {
        name: 'wifi',
        description: 'Get the lab\'s Wi-Fi credentials (Members only)',
    },
    {
        name: 'tip',
        description: 'Send Stake to another user',
        options: [
            {
                name: 'user',
                description: 'The user to tip',
                type: 6, // USER
                required: true,
            },
            {
                name: 'amount',
                description: 'The amount of Stake to tip',
                type: 4, // INTEGER
                required: true,
            },
        ],
    },
    {
        name: 'enroll',
        description: 'Create a FabLab account',
        options: [
            {
                name: 'email',
                description: 'Your email address',
                type: 3, // STRING
                required: true,
            },
        ],
    },
    {
        name: 'award',
        description: 'Award Stake to a user (Staff only)',
        options: [
            {
                name: 'user',
                description: 'The user to award',
                type: 6, // USER
                required: true,
            },
            {
                name: 'amount',
                description: 'The amount of Stake to award',
                type: 4, // INTEGER
                required: true,
            },
            {
                name: 'reason',
                description: 'The reason for the award',
                type: 3, // STRING
                required: true,
            },
        ],
    },
];

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        const token = process.env.DISCORD_BOT_TOKEN;
        const clientId = process.env.DISCORD_CLIENT_ID;
        const guildId = process.env.DISCORD_GUILD_ID;

        if (!token || !clientId) {
            throw new Error('DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID is missing in environment variables.');
        }

        let url = `https://discord.com/api/v10/applications/${clientId}/commands`;

        if (guildId) {
            console.log(`Registering commands to Guild ID: ${guildId} (Instant update)`);
            url = `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`;
        } else {
            console.log('Registering Global commands (Up to 1 hour update time)');
        }

        const response = await axios.put(url, commands, {
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': 'application/json',
            },
        });

        console.log('Successfully reloaded application (/) commands.');
        console.log(`Registered ${response.data.length} commands.`);
    } catch (error) {
        console.error('Error registering commands:');
        if (error.response) {
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }
    }
})();
