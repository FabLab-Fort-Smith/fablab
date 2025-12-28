import BountyService from "./service";

export default class BountyController {
    static async createBounty(req) {
        try {
            const data = await req.json();
            const bounty = await BountyService.createBounty(data);
            return new Response(JSON.stringify({ bounty }), { status: 201 });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }

    static async getAllBounties(req) {
        try {
            const { searchParams } = new URL(req.url);
            const bountyID = searchParams.get('bountyID');
            
            if (bountyID) {
                const bounty = await BountyService.getBounty(bountyID);
                if (!bounty) return new Response(JSON.stringify({ error: "Bounty not found" }), { status: 404 });
                return new Response(JSON.stringify({ bounty }), { status: 200 });
            }

            const status = searchParams.get('status');
            const creatorID = searchParams.get('creatorID');
            const page = parseInt(searchParams.get('page') || '1');
            const limit = parseInt(searchParams.get('limit') || '10');

            const result = await BountyService.getAllBounties({ status, creatorID }, page, limit);
            return new Response(JSON.stringify(result), { status: 200 });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }

    static async updateBounty(req) {
        try {
            const { searchParams } = new URL(req.url);
            const bountyID = searchParams.get('bountyID');
            const action = searchParams.get('action'); // assign, submit, verify, cancel
            const data = await req.json();

            if (!bountyID) return new Response(JSON.stringify({ error: "Bounty ID required" }), { status: 400 });

            let result;
            switch (action) {
                case 'assign':
                    result = await BountyService.assignBounty(bountyID, data.userID);
                    break;
                case 'submit':
                    result = await BountyService.submitBounty(bountyID, data.userID, data.submission);
                    break;
                case 'verify':
                    result = await BountyService.verifyBounty(bountyID, data.verifierID);
                    break;
                case 'cancel':
                    result = await BountyService.cancelBounty(bountyID, data.userID);
                    break;
                case 'edit':
                    result = await BountyService.editBounty(bountyID, data.userID, data.updateData);
                    break;
                case 'clawback':
                    result = await BountyService.clawbackBounty(bountyID, data.userID, data.claimUserID);
                    break;
                case 'like':
                    result = await BountyService.toggleLike(bountyID, data.userID);
                    break;
                case 'comment':
                    result = await BountyService.addComment(bountyID, data.userID, data.text);
                    break;
                case 'share':
                    result = await BountyService.shareBounty(bountyID, data.senderID, data.recipientID);
                    break;
                default:
                    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
            }

            return new Response(JSON.stringify({ success: true, result }), { status: 200 });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }
}
