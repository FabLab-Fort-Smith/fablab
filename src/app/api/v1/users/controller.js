// src/app/api/users/user.controller.js

import UserService from "./service";

export default class UserController {
    /**
     * ✅ Create a new user through the service layer
     * @param {Request} req - The incoming request object containing user data
     * @returns {Response} - JSON response with success or error message
     */
    static createUser = async (req) => {
        try {
            const userData = await req.json();
            const createdUser = await UserService.createUser(userData);
            if (!createdUser) {
                return new Response(
                    JSON.stringify({ error: "Failed to create user." }),
                    { status: 400 }
                );
            }
            return new Response(
                JSON.stringify({ message: "User created successfully", user: createdUser }),
                { status: 201 }
            );
        } catch (error) {
            console.error("Error in UserController.createUser:", error);
            return new Response(
                JSON.stringify({ error: "An error occurred while creating the user." }),
                { status: 500 }
            );
        }
    }

    /**
     * ✅ Get a user by query parameter
     * @param {Request} req - The request object containing the query parameter
     * @returns {Response} - JSON response with user data or error message
     */
    static getUserByQuery = async (req) => {
        try {
            const { searchParams } = new URL(req.url);
            const query = {};

            ['email', 'username', 'userID', 'phoneNumber', 'firstName', 'lastName'].forEach(param => {
                const value = searchParams.get(param);
                if (value) query[param] = value;
            });

            if (Object.keys(query).length === 0) {
                return new Response(
                    JSON.stringify({ error: "At least one query parameter is required." }),
                    { status: 400 }
                );
            }

            const user = await UserService.getUserByQuery(query);

            if (!user) {
                return new Response(
                    JSON.stringify({ error: "User not found." }),
                    { status: 404 }
                );
            }
            return new Response(
                JSON.stringify({ user }),
                { status: 200 }
            );
        } catch (error) {
            console.error("❌ Error in UserController.getUserByQuery:", error);
            return new Response(
                JSON.stringify({ error: "Failed to fetch user." }),
                { status: 500 }
            );
        }
    }
    

    /**
     * ✅ Get all users from the database
     * @param {Request} req - The request object
     * @returns {Response} - JSON response with all users or error message
     */
    static getAllUsers = async (req) => {
        try {
            const { searchParams } = new URL(req.url);
            const filters = {};
            
            if (searchParams.get('isPublic') === 'true') {
                filters.isPublic = true;
            }
            
            if (searchParams.get('role')) {
                filters.role = searchParams.get('role');
            }

            const page = parseInt(searchParams.get('page') || '1');
            const limit = parseInt(searchParams.get('limit') || '12');
            
            const result = await UserService.getAllUsers(filters, page, limit);
            return new Response(
                JSON.stringify(result),
                { status: 200 }
            );
        } catch (error) {
            console.error("Error in UserController.getAllUsers:", error);
            return new Response(
                JSON.stringify({ error: "Failed to fetch users." }),
                { status: 500 }
            );
        }
    }

    /**
     * ✅ Update a user by query
     * @param {Request} req - Request containing the query and update data
     * @returns {Response} - JSON response with success or error message
     */
    static updateUser = async (req) => {
        try {
            const { searchParams } = new URL(req.url);
            let query = searchParams.get("query");
            const updateData = await req.json();

            if (!query) {
                // If 'query' param is missing, check for specific identifiers
                const identifiers = ['userID', 'email', 'username', 'phoneNumber'];
                for (const id of identifiers) {
                    const val = searchParams.get(id);
                    if (val) {
                        query = val;
                        break;
                    }
                }
            }

            if (!query) {
                return new Response(
                    JSON.stringify({ error: "Query parameter (or userID, email, etc.) is required." }),
                    { status: 400 }
                );
            }

            const updatedUser = await UserService.updateUser(query, updateData);
            if (!updatedUser) {
                return new Response(
                    JSON.stringify({ error: "Failed to update user." }),
                    { status: 400 }
                );
            }

            return new Response(
                JSON.stringify({ message: "User updated successfully", user: updatedUser }),
                { status: 200 }
            );
        } catch (error) {
            console.error("Error in UserController.updateUser:", error);
            return new Response(
                JSON.stringify({ error: error.message || "An error occurred while updating the user." }),
                { status: 500 }
            );
        }
    }

    /**
     * ✅ Delete a user by query parameter
     * @param {Request} req - Request containing the query parameter
     * @returns {Response} - JSON response with success or error message
     */
    static deleteUser = async (req) => {
        try {
            const { searchParams } = new URL(req.url);
            const query = searchParams.get("query");

            if (!query) {
                return new Response(
                    JSON.stringify({ error: "Query parameter is required." }),
                    { status: 400 }
                );
            }

            const deletionResult = await UserService.deleteUser(query);
            if (!deletionResult) {
                return new Response(
                    JSON.stringify({ error: "Failed to delete user." }),
                    { status: 400 }
                );
            }

            return new Response(
                JSON.stringify({ message: "User deleted successfully." }),
                { status: 200 }
            );
        } catch (error) {
            console.error("Error in UserController.deleteUser:", error);
            return new Response(
                JSON.stringify({ error: "An error occurred while deleting the user." }),
                { status: 500 }
            );
        }
    }

    /**
     * ✅ Nudge a user
     */
    static nudgeUser = async (req) => {
        try {
            const { userID, preview } = await req.json();
            if (!userID) {
                return new Response(JSON.stringify({ error: "UserID is required" }), { status: 400 });
            }

            const result = await UserService.nudgeUser(userID, preview);
            return new Response(JSON.stringify(result), { status: 200 });
        } catch (error) {
            console.error("Error in UserController.nudgeUser:", error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }

    /**
     * ✅ Merge two users
     */
    static mergeUsers = async (req) => {
        try {
            const { targetUserID, sourceUserID, overrides } = await req.json();
            
            if (!targetUserID || !sourceUserID) {
                return new Response(JSON.stringify({ error: "Target and Source User IDs are required" }), { status: 400 });
            }

            if (targetUserID === sourceUserID) {
                return new Response(JSON.stringify({ error: "Cannot merge a user into themselves" }), { status: 400 });
            }

            const result = await UserService.mergeUsers(targetUserID, sourceUserID, overrides);
            return new Response(JSON.stringify({ success: true, user: result }), { status: 200 });
        } catch (error) {
            console.error("Error in UserController.mergeUsers:", error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }
}
