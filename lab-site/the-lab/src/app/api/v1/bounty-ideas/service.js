import BountyIdea from "./class";
import BountyIdeaModel from "./model";

export default class BountyIdeaService {
    static async createIdea(data) {
        const idea = new BountyIdea(
            data.title,
            data.description,
            data.rewardType,
            data.rewardValue,
            data.stakeValue,
            data.requirements,
            data.recurrence,
            data.isInfinite,
            data.imageUrl
        );
        return await BountyIdeaModel.createIdea(idea);
    }

    static async getAllIdeas() {
        return await BountyIdeaModel.getAllIdeas();
    }

    static async getIdeaById(ideaID) {
        return await BountyIdeaModel.getIdeaById(ideaID);
    }

    static async updateIdea(ideaID, data) {
        return await BountyIdeaModel.updateIdea(ideaID, data);
    }

    static async deleteIdea(ideaID) {
        return await BountyIdeaModel.deleteIdea(ideaID);
    }
}