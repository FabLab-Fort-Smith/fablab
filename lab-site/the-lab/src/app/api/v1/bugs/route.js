import BugController from "./controller";

export async function GET(req) {
    return await BugController.getBugs(req);
}

export async function POST(req) {
    return await BugController.createBug(req);
}

export async function PUT(req) {
    return await BugController.updateBug(req);
}
