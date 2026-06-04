import FeedController from "./controller";

export const runtime = "nodejs";

export async function GET(req) {
    return await FeedController.getFeed(req);
}
