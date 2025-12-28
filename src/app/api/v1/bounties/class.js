import { v4 as uuidv4 } from 'uuid';

export default class Bounty {
    constructor(
        title,
        description,
        creatorID,
        rewardType, // 'hours', 'crypto', 'custom'
        rewardValue, // e.g., 4 (hours), '0.001 BTC', 'High Five'
        stakeValue, // Points awarded for completion
        requirements = [],
        recurrence = 'none', // 'none', 'daily', 'weekly', 'monthly'
        startsAt = null,
        isInfinite = false,
        endsAt = null,
        imageUrl = null,
        badgeRewardID = null
    ) {
        this.bountyID = `bounty-${uuidv4().slice(0, 8)}`;
        this.title = title;
        this.description = description;
        this.creatorID = creatorID;
        this.rewardType = rewardType;
        this.rewardValue = rewardValue;
        this.stakeValue = Number(stakeValue) || 0;
        this.requirements = requirements;
        this.recurrence = recurrence;
        this.startsAt = startsAt ? new Date(startsAt) : new Date();
        this.isInfinite = isInfinite;
        this.endsAt = endsAt ? new Date(endsAt) : null;
        this.imageUrl = imageUrl;
        this.badgeRewardID = badgeRewardID;
        
        this.status = 'open'; // open, assigned, completed, verified, cancelled
        this.assignedTo = null; // userID (Legacy/Single claim)
        this.assignedAt = null;
        
        this.claims = []; // Array of { claimID, userID, claimedAt, status, submission: { text, date } }
        this.submissions = []; // Legacy/Single claim submissions
        
        this.createdAt = new Date();
        this.updatedAt = new Date();
        this.completedAt = null;
    }
}
