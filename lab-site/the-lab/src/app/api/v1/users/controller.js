// src/app/api/users/user.controller.js

import { auth } from "@/auth";
import UserService from "./service";
import { auditLog } from "@/lib/audit";

// SEC-02: the user API is not behind middleware, so every handler authenticates
// at the edge and passes the caller's identity (the `actor`) into the service,
// which enforces field-level authorization and the public-safe read projection.
const unauthorized = () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
const forbidden = () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

/** Build the actor context the service expects from a session. */
const toActor = (session) => ({
    userID: session?.user?.userID ?? null,
    role: session?.user?.role ?? null,
});

export default class UserController {
    /**
     * ✅ Create a new user (admin only — public signup goes through /api/auth/register)
     * @param {Request} req - The incoming request object containing user data
     * @returns {Response} - JSON response with success or error message
     */
    static createUser = async (req) => {
        try {
            const session = await auth();
            if (!session?.user?.userID) return unauthorized();
            if (session.user.role !== "admin") return forbidden();

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
     * ✅ Get a user by query parameter. Public for opted-in active members
     * (returns a safe projection); the owner and admins get the full record.
     * @param {Request} req - The request object containing the query parameter
     * @returns {Response} - JSON response with user data or error message
     */
    static getUserByQuery = async (req) => {
        try {
            const session = await auth();
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

            const user = await UserService.getUserByQuery(query, toActor(session));

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
     * ✅ Get all users. Non-admins (incl. anonymous) get a public-safe listing of
     * opted-in members only; admins get the full directory with all filters.
     * @param {Request} req - The request object
     * @returns {Response} - JSON response with all users or error message
     */
    static getAllUsers = async (req) => {
        try {
            const session = await auth();
            const { searchParams } = new URL(req.url);
            const filters = {};

            if (searchParams.get('isPublic') === 'true') {
                filters.isPublic = true;
            }

            if (searchParams.get('role')) {
                filters.role = searchParams.get('role');
            }

            if (searchParams.get('search')) {
                filters.search = searchParams.get('search');
            }

            if (searchParams.get('memberType')) {
                filters.memberType = searchParams.get('memberType');
            }

            const page = parseInt(searchParams.get('page') || '1');
            const limit = parseInt(searchParams.get('limit') || '12');

            const result = await UserService.getAllUsers(filters, page, limit, toActor(session));
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
     * ✅ Update a user by query. Non-admins may only update their own record
     * (ownership is forced to the session user); admins may target any user.
     * @param {Request} req - Request containing the query and update data
     * @returns {Response} - JSON response with success or error message
     */
    static updateUser = async (req) => {
        try {
            const session = await auth();
            if (!session?.user?.userID) return unauthorized();
            const isAdminUser = session.user.role === "admin";

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

            // Ownership: a non-admin can only ever update their own record,
            // regardless of the identifier they supplied.
            if (!isAdminUser) {
                query = session.user.userID;
            }

            if (!query) {
                return new Response(
                    JSON.stringify({ error: "Query parameter (or userID, email, etc.) is required." }),
                    { status: 400 }
                );
            }

            const updatedUser = await UserService.updateUser(query, updateData, toActor(session));
            if (!updatedUser) {
                return new Response(
                    JSON.stringify({ error: "Failed to update user." }),
                    { status: 400 }
                );
            }

            // Audit privilege/access-sensitive changes made through the broad admin PUT so this path
            // isn't an unaudited alternative to the dedicated AC-3 role/status endpoints (SEC #183 carry-in).
            if (isAdminUser) {
                // Use the persisted user's id (never the lookup `query`, which may be an email/phone —
                // no PII in retained audit) and the persisted value (truthful trail). (SEC #188 L-1/L-2)
                const targetID = updatedUser.userID || query;
                if (Object.prototype.hasOwnProperty.call(updateData, "role"))
                    auditLog("admin.member.role.change", { actor: session.user.userID, target: targetID, after: updatedUser.role, source: "users.PUT", outcome: "success" });
                if (updateData.membership && Object.prototype.hasOwnProperty.call(updateData.membership, "status"))
                    auditLog("admin.member.status.change", { actor: session.user.userID, target: targetID, after: updatedUser.membership?.status, source: "users.PUT", outcome: "success" });
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
     * ✅ Delete a user by query parameter (admin only)
     * @param {Request} req - Request containing the query parameter
     * @returns {Response} - JSON response with success or error message
     */
    static deleteUser = async (req) => {
        try {
            const session = await auth();
            if (!session?.user?.userID) return unauthorized();
            if (session.user.role !== "admin") return forbidden();

            const { searchParams } = new URL(req.url);
            const userID = searchParams.get("userID") || searchParams.get("query");

            if (!userID) {
                return new Response(
                    JSON.stringify({ error: "userID parameter is required." }),
                    { status: 400 }
                );
            }

            const deletionResult = await UserService.deleteUser({ userID });
            if (!deletionResult) {
                return new Response(
                    JSON.stringify({ error: "Failed to delete user." }),
                    { status: 400 }
                );
            }

            auditLog("admin.member.delete", { actor: session.user.userID, target: userID, outcome: "success" });
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
     * ✅ Nudge a user (admin only)
     */
    static nudgeUser = async (req) => {
        try {
            const session = await auth();
            if (!session?.user?.userID) return unauthorized();
            if (session.user.role !== "admin") return forbidden();

            const { userID, preview } = await req.json();
            if (!userID) {
                return new Response(JSON.stringify({ error: "UserID is required" }), { status: 400 });
            }

            const result = await UserService.nudgeUser(userID, preview);
            if (!preview) auditLog("admin.member.nudge", { actor: session.user.userID, target: userID, outcome: "sent" });
            return new Response(JSON.stringify(result), { status: 200 });
        } catch (error) {
            console.error("Error in UserController.nudgeUser:", error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }

    /**
     * ✅ Merge two users. Admins may merge any pair. A non-admin may only merge a
     * source account INTO their own account, and must prove ownership of the
     * source by supplying its credentials (verified server-side).
     */
    static mergeUsers = async (req) => {
        try {
            const session = await auth();
            if (!session?.user?.userID) return unauthorized();

            const { targetUserID, sourceUserID, overrides, sourceEmail, sourcePassword } = await req.json();

            if (!targetUserID || !sourceUserID) {
                return new Response(JSON.stringify({ error: "Target and Source User IDs are required" }), { status: 400 });
            }

            if (targetUserID === sourceUserID) {
                return new Response(JSON.stringify({ error: "Cannot merge a user into themselves" }), { status: 400 });
            }

            if (session.user.role !== "admin") {
                // Self-merge: must own the target, and prove ownership of the source.
                if (targetUserID !== session.user.userID) return forbidden();
                const ownsSource = await UserService.verifyCredentials(sourceUserID, sourceEmail, sourcePassword);
                if (!ownsSource) return forbidden();
            }

            const result = await UserService.mergeUsers(targetUserID, sourceUserID, overrides, toActor(session));
            auditLog("admin.member.merge", { actor: session.user.userID, target: targetUserID, source: sourceUserID, outcome: "success" });
            return new Response(JSON.stringify({ success: true, user: result }), { status: 200 });
        } catch (error) {
            console.error("Error in UserController.mergeUsers:", error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }
}
