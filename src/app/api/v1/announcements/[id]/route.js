
import AnnouncementController from "../controller";

export async function PUT(req, context) {
    return await AnnouncementController.updateAnnouncement(req, context);
}

export async function DELETE(req, context) {
    return await AnnouncementController.deleteAnnouncement(req, context);
}
