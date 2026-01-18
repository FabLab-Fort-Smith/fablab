import BountyService from "./service";
import { auth } from "../../../../../auth";

export default class BountyController {
    static async createBounty(req) {
        try {
            const session = await auth();
            if (!session?.user?.userID) {
                return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
            }

            const data = await req.json();
            // Force creatorID to be the authenticated user
            data.creatorID = session.user.userID;

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
            const session = await auth();
            if (!session?.user?.userID) {
                return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
            }
            const userID = session.user.userID;

            const { searchParams } = new URL(req.url);
            const bountyID = searchParams.get('bountyID');
            const action = searchParams.get('action'); // assign, submit, verify, cancel
            const data = await req.json();

            if (!bountyID) return new Response(JSON.stringify({ error: "Bounty ID required" }), { status: 400 });

            let result;
            switch (action) {
                case 'assign':
                    // User assigns to themselves
                    result = await BountyService.assignBounty(bountyID, userID);
                    break;
                case 'submit':
                    result = await BountyService.submitBounty(bountyID, userID, data.submission);
                    break;
                case 'verify':
                    // Authenticated user is the verifier
                    result = await BountyService.verifyBounty(bountyID, userID, data.claimUserID); // Pass claimUserID if infinite
                    break;
                case 'cancel':
                    result = await BountyService.cancelBounty(bountyID, userID);
                    break;
                case 'edit':
                    result = await BountyService.editBounty(bountyID, userID, data.updateData);
                    break;
                case 'clawback':
                    result = await BountyService.clawbackBounty(bountyID, userID, data.claimUserID);
                    break;
                case 'like':
                    result = await BountyService.toggleLike(bountyID, userID);
                    break;
                case 'comment':
                    result = await BountyService.addComment(bountyID, userID, data.text);
                    break;
                case 'share':
                    result = await BountyService.shareBounty(bountyID, userID, data.recipientID);
                    break;
                default:
                    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
            }

            return new Response(JSON.stringify({ success: true, result }), { status: 200 });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }

    static async deleteBounty(req) {
        try {
            const session = await auth();
            if (!session?.user?.userID) {
                return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
            }
            const userID = session.user.userID;

            const { searchParams } = new URL(req.url);
            const bountyID = searchParams.get('bountyID');
            // const userID = searchParams.get('userID'); // No longer needed from params

            if (!bountyID) return new Response(JSON.stringify({ error: "Bounty ID required" }), { status: 400 });
            
            const result = await BountyService.deleteBounty(bountyID, userID);
            return new Response(JSON.stringify({ success: true, result }), { status: 200 });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }
}
