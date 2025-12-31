
import AnnouncementService from "./service";
import { auth } from "../../../../../auth"; // Adjust path as needed

export default class AnnouncementController {
    
    /**
     * Create a new announcement
     */
    static createAnnouncement = async (req) => {
        try {
            const session = await auth();
            if (!session || session.user.role !== 'admin') {
                return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
            }

            const data = await req.json();
            
            // Validate required fields
            if (!data.title || !data.content) {
                return new Response(JSON.stringify({ error: "Title and content are required" }), { status: 400 });
            }

            const announcement = await AnnouncementService.createAnnouncement(data, session.user);
            
            return new Response(JSON.stringify(announcement), { status: 201 });
        } catch (error) {
            console.error("Error creating announcement:", error);
            return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
        }
    }

    /**
     * Get announcements
     * - If admin: returns all
     * - If user/public: returns active only
     */
    static getAnnouncements = async (req) => {
        try {
            const session = await auth();
            const isAdmin = session?.user?.role === 'admin';

            let announcements;
            if (isAdmin) {
                announcements = await AnnouncementService.getAllAnnouncements();
            } else {
                announcements = await AnnouncementService.getActiveAnnouncements();
            }

            return new Response(JSON.stringify(announcements), { status: 200 });
        } catch (error) {
            console.error("Error fetching announcements:", error);
            return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
        }
    }

    /**
     * Update announcement
     */
    static updateAnnouncement = async (req, { params }) => {
        try {
            const session = await auth();
            if (!session || session.user.role !== 'admin') {
                return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
            }

            const { id } = params;
            const updates = await req.json();

            const result = await AnnouncementService.updateAnnouncement(id, updates);
            
            if (!result.value) {
                return new Response(JSON.stringify({ error: "Announcement not found" }), { status: 404 });
            }

            return new Response(JSON.stringify(result.value), { status: 200 });
        } catch (error) {
            console.error("Error updating announcement:", error);
            return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
        }
    }

    /**
     * Delete announcement
     */
    static deleteAnnouncement = async (req, { params }) => {
        try {
            const session = await auth();
            if (!session || session.user.role !== 'admin') {
                return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
            }

            const { id } = params;
            const success = await AnnouncementService.deleteAnnouncement(id);

            if (!success) {
                return new Response(JSON.stringify({ error: "Announcement not found" }), { status: 404 });
            }

            return new Response(JSON.stringify({ message: "Announcement deleted" }), { status: 200 });
        } catch (error) {
            console.error("Error deleting announcement:", error);
            return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
        }
    }
}
