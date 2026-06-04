import UserController from "../controller";

export async function POST(req) {
    return await UserController.nudgeUser(req);
}
