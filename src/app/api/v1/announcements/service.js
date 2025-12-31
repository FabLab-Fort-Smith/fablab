
import Announcement from "./class";
import AnnouncementModel from "./model";
import DiscordService from "@/lib/discord";
import Constants from "@/lib/constants";

export default class AnnouncementService {
    
    /**
     * Create a new announcement and optionally post to Discord
     * @param {Object} data - Announcement data
     * @param {Object} user - User creating the announcement
     * @returns {Object} - Created announcement
     */
    static createAnnouncement = async (data, user) => {
        try {
            const announcement = new Announcement({
                ...data,
                createdBy: user._id
            });

            const doc = announcement.toDocument();
            const createdAnnouncement = await AnnouncementModel.create(doc);

            // Post to Discord if requested
            if (data.postToDiscord) {
                await this.postToDiscord(createdAnnouncement);
            }

            return createdAnnouncement;
        } catch (error) {
            console.error("Error in AnnouncementService.createAnnouncement:", error);
            throw error;
        }
    }

    /**
     * Get all announcements (admin view)
     */
    static getAllAnnouncements = async () => {
        return await AnnouncementModel.getAll();
    }

    /**
     * Get active announcements (user view)
     */
    static getActiveAnnouncements = async () => {
        return await AnnouncementModel.getActive();
    }

    /**
     * Update an announcement
     */
    static updateAnnouncement = async (id, updates) => {
        return await AnnouncementModel.update(id, updates);
    }

    /**
     * Delete an announcement
     */
    static deleteAnnouncement = async (id) => {
        return await AnnouncementModel.delete(id);
    }

    /**
     * Post announcement to Discord
     */
    static postToDiscord = async (announcement) => {
        if (!Constants.DISCORD_ANNOUNCEMENTS_CHANNEL_ID) {
            console.warn("⚠️ DISCORD_ANNOUNCEMENTS_CHANNEL_ID is not set.");
            return;
        }

        const embed = {
            title: `📢 ${announcement.title}`,
            description: announcement.content,
            color: this.getTypeColor(announcement.type),
            timestamp: new Date().toISOString(),
            footer: {
                text: "The Lab Announcements"
            }
        };

        await DiscordService.sendChannelMessage(Constants.DISCORD_ANNOUNCEMENTS_CHANNEL_ID, { embeds: [embed] });
    }

    static getTypeColor(type) {
        switch (type) {
            case 'warning': return 0xFFA500; // Orange
            case 'alert': return 0xFF0000; // Red
            case 'success': return 0x00FF00; // Green
            default: return 0x3498DB; // Blue (Info)
        }
    }
}
