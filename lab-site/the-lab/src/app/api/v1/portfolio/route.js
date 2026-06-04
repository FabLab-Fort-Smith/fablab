import PortfolioController from "./controller";

export const runtime = "nodejs";

export async function GET(req) {
    return await PortfolioController.getAllItems(req);
}

export async function POST(req) {
    return await PortfolioController.createItem(req);
}

export async function PUT(req) {
    return await PortfolioController.updateItem(req);
}
