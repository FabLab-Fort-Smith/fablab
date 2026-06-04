// src/app/api/users/route.js
import UserController from "./controller";

/**
 * ✅ Route for creating a new user
 */
export async function POST(req) {
    return await UserController.createUser(req);
}

/**
 * ✅ Route for getting users
 * If a query parameter is provided, fetch a specific user
 * Otherwise, fetch all users
 */
export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const queryParams = ['email', 'username', 'userID', 'phoneNumber', 'firstName', 'lastName'];
    const hasQuery = queryParams.some(param => searchParams.get(param));

    if (hasQuery) {
        return await UserController.getUserByQuery(req);
    } else {
        return await UserController.getAllUsers(req);
    }
}

/**
 * ✅ Route for updating a user by query
 */
export async function PUT(req) {
    return await UserController.updateUser(req);
}

/**
 * ✅ Route for deleting a user by query
 */
export async function DELETE(req) {
    return await UserController.deleteUser(req);
}
