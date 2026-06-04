import UserController from "../controller";

export async function POST(req) {
    return await UserController.mergeUsers(req);
}
