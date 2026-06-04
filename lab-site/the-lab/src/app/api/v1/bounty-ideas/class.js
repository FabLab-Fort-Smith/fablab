import { v4 as uuidv4 } from 'uuid';

export default class BountyIdea {
    constructor(title, description, rewardType, rewardValue, stakeValue, requirements, recurrence, isInfinite, imageUrl = null) {
        this.ideaID = `idea-${uuidv4().split('-')[0]}`;
        this.title = title;
        this.description = description;
        this.rewardType = rewardType;
        this.rewardValue = rewardValue;
        this.stakeValue = stakeValue;
        this.requirements = requirements || [];
        this.recurrence = recurrence || 'none';
        this.isInfinite = isInfinite || false;
        this.imageUrl = imageUrl;
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }
}