require('dotenv').config({ path: '.env.local', quiet: true });
const axios = require('axios');

(async () => {
    try {
        console.log('Started deleting global application (/) commands.');

        const token = process.env.DISCORD_BOT_TOKEN;
        const clientId = process.env.DISCORD_CLIENT_ID;

        if (!token || !clientId) {
            throw new Error('DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID is missing in environment variables.');
        }

        // Global commands endpoint
        const url = `https://discord.com/api/v10/applications/${clientId}/commands`;

        // Overwrite with empty array to delete all global commands
        const response = await axios.put(url, [], {
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': 'application/json',
            },
        });

        console.log('Successfully deleted all global application (/) commands.');
        console.log('You should now only see the Guild-specific commands (no duplicates).');
        console.log('Note: It might take up to 1 hour for Discord to clear the global cache on all clients, but a restart (Ctrl+R) usually helps.');
    } catch (error) {
        console.error('Error deleting commands:');
        if (error.response) {
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }
    }
})();
