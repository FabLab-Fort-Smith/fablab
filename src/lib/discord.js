import Constants from './constants';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

export default class DiscordService {
    /**
     * Helper to make requests to Discord API
     */
    static async request(endpoint, method = 'GET', body = null) {
        if (!BOT_TOKEN) {
            console.warn("⚠️ DISCORD_BOT_TOKEN is not set. Skipping Discord API call.");
            return null;
        }

        const url = `${DISCORD_API_BASE}${endpoint}`;
        const options = {
            method,
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorData = await response.json();
                console.error(`❌ Discord API Error [${method} ${endpoint}]:`, errorData);
                return null;
            }
            // 204 No Content handling
            if (response.status === 204) return true;
            return await response.json();
        } catch (error) {
            console.error(`❌ Discord Request Failed:`, error);
            return null;
        }
    }

    /**
     * Send a message to a specific channel
     * @param {string} channelId 
     * @param {string|object} content - Message content string or embed object
     */
    static async sendChannelMessage(channelId, content) {
        const body = typeof content === 'string' ? { content } : content;
        return await this.request(`/channels/${channelId}/messages`, 'POST', body);
    }

    /**
     * Add a user to the Discord Guild (Server)
     * Requires 'guilds.join' scope on the user's access token
     * @param {string} discordUserId - The user's Discord ID
     * @param {string} userAccessToken - The OAuth2 access token from the user's session
     */
    static async addMemberToGuild(discordUserId, userAccessToken) {
        if (!GUILD_ID || !BOT_TOKEN) {
            console.warn("⚠️ Cannot add member to guild: Missing Guild ID or Bot Token.");
            return;
        }

        console.log(`➕ Adding User ${discordUserId} to Guild ${GUILD_ID}`);
        
        // PUT /guilds/{guild.id}/members/{user.id}
        // Requires Bot Token for Authorization
        // Body requires the user's access_token
        
        const url = `${DISCORD_API_BASE}/guilds/${GUILD_ID}/members/${discordUserId}`;
        const options = {
            method: 'PUT',
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                access_token: userAccessToken,
            })
        };

        try {
            const response = await fetch(url, options);
            
            if (response.status === 201) {
                console.log(`✅ Successfully added user ${discordUserId} to the guild.`);
                return true;
            } else if (response.status === 204) {
                console.log(`ℹ️ User ${discordUserId} is already in the guild.`);
                return true;
            } else {
                const errorData = await response.json();
                console.error(`❌ Failed to add user to guild:`, errorData);
                return false;
            }
        } catch (error) {
            console.error(`❌ Discord Add Member Request Failed:`, error);
            return false;
        }
    }

    /**
     * Get all channels for the guild
     */
    static async getGuildChannels() {
        if (!GUILD_ID) return [];
        return await this.request(`/guilds/${GUILD_ID}/channels`, 'GET');
    }

    /**
     * Create an invite for a specific channel
     * @param {string} channelId 
     * @param {object} options - { max_age, max_uses, unique }
     */
    static async createInvite(channelId, options = { max_age: 0, max_uses: 0, unique: false }) {
        return await this.request(`/channels/${channelId}/invites`, 'POST', options);
    }

    /**
     * Get a guild member
     */
    static async getMember(userId) {
        if (!GUILD_ID) return null;
        return await this.request(`/guilds/${GUILD_ID}/members/${userId}`, 'GET');
    }

    /**
     * Add a role to a guild member
     */
    static async addRole(userId, roleId) {
        if (!GUILD_ID) return;
        console.log(`➕ Adding Role ${roleId} to User ${userId}`);
        return await this.request(`/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`, 'PUT');
    }

    /**
     * Remove a role from a guild member
     */
    static async removeRole(userId, roleId) {
        if (!GUILD_ID) return;
        console.log(`➖ Removing Role ${roleId} from User ${userId}`);
        return await this.request(`/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`, 'DELETE');
    }

    /**
     * Sync user's creator types with Discord roles
     * @param {string} discordUserId - The user's Discord ID
     * @param {string[]} creatorTypes - Array of selected creator types (e.g. ['Maker', 'Hacker'])
     */
    static async syncCreatorRoles(discordUserId, creatorTypes) {
        if (!discordUserId || !GUILD_ID) {
            console.warn("⚠️ Cannot sync roles: Missing Discord User ID or Guild ID.");
            return;
        }

        const mapping = Constants.CREATOR_ROLE_MAPPING;
        const selectedTypes = Array.isArray(creatorTypes) ? creatorTypes : [creatorTypes];

        console.log(`🔄 Syncing Discord Roles for ${discordUserId}. Selected Types:`, selectedTypes);

        for (const [type, roleId] of Object.entries(mapping)) {
            // Skip if roleId is a placeholder or invalid
            if (!roleId || roleId.length < 10) continue;

            if (selectedTypes.includes(type)) {
                // User has this type -> Add Role
                await this.addRole(discordUserId, roleId);
            } else {
                // User does NOT have this type -> Remove Role
                // Note: This assumes we want to strictly enforce the state. 
                // If the user manually added the role in Discord, this would remove it.
                await this.removeRole(discordUserId, roleId);
            }
        }
    }

    /**
     * Sync user's membership status with Discord roles (LabRatz)
     * @param {string} discordUserId - The user's Discord ID
     * @param {string} status - The user's membership status
     */
    static async syncMembershipRole(discordUserId, status) {
        if (!discordUserId || !GUILD_ID) return;

        const LAB_RATZ_ROLE_ID = Constants.LAB_RATZ_ROLE_ID;
        // "Active members are LabRatz, if they are paying dues and doing hours they are LabRatz"
        // In our system, 'active' and 'probation' are the paid statuses.
        const isActive = ['active', 'probation'].includes(status);

        console.log(`🔄 Syncing LabRatz Role for ${discordUserId}. Status: ${status}`);

        if (isActive) {
            await this.addRole(discordUserId, LAB_RATZ_ROLE_ID);
        } else {
            await this.removeRole(discordUserId, LAB_RATZ_ROLE_ID);
        }
    }

    /**
     * Send a Direct Message to a user
     * @param {string} userId - The Discord User ID
     * @param {string|object} content - Message content
     */
    static async sendDirectMessage(userId, content) {
        // 1. Create DM Channel
        const channel = await this.request(`/users/@me/channels`, 'POST', { recipient_id: userId });
        if (!channel || !channel.id) {
            console.error(`❌ Failed to create DM channel with user ${userId}`);
            return null;
        }

        // 2. Send Message
        const body = typeof content === 'string' ? { content } : content;
        return await this.request(`/channels/${channel.id}/messages`, 'POST', body);
    }
}
