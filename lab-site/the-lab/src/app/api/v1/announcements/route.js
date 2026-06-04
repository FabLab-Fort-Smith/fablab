
import AnnouncementController from "./controller";

export async function GET(req) {
    return await AnnouncementController.getAnnouncements(req);
}

export async function POST(req) {
    return await AnnouncementController.createAnnouncement(req);
}
