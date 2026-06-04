import BountyController from "./controller";

export async function GET(req) {
    return await BountyController.getAllBounties(req);
}

export async function POST(req) {
    return await BountyController.createBounty(req);
}

export async function PUT(req) {
    return await BountyController.updateBounty(req);
}

export async function DELETE(req) {
    return await BountyController.deleteBounty(req);
}
