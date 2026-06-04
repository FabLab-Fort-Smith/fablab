import { v4 as uuidv4 } from 'uuid';

export default class Notification {
    constructor(
        userID,
        type = 'info', // info, success, warning, error
        title,
        message,
        link = null,
        metadata = {}
    ) {
        this.notificationID = `notif-${uuidv4().slice(0, 8)}`;
        this.userID = userID;
        this.type = type;
        this.title = title;
        this.message = message;
        this.link = link;
        this.read = false;
        this.createdAt = new Date();
        this.metadata = metadata;
    }
}
