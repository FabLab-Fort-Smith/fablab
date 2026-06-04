
import { ObjectId } from 'mongodb';

class Announcement {
    constructor(data) {
        this._id = data._id ? new ObjectId(data._id) : undefined;
        this.title = data.title;
        this.content = data.content;
        this.type = data.type || 'info'; // info, warning, alert, success
        this.isActive = data.isActive !== undefined ? data.isActive : true;
        this.createdBy = data.createdBy ? new ObjectId(data.createdBy) : null;
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = new Date();
        this.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    }

    toDocument() {
        const doc = {
            title: this.title,
            content: this.content,
            type: this.type,
            isActive: this.isActive,
            createdBy: this.createdBy,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            expiresAt: this.expiresAt
        };
        
        // Remove undefined fields
        Object.keys(doc).forEach(key => doc[key] === undefined && delete doc[key]);
        
        return doc;
    }
}

export default Announcement;
