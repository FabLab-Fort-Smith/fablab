import { v4 as uuidv4 } from 'uuid';
import BugModel from "./model";
import UserModel from "../users/model";
import Constants from "@/lib/constants";
import NotificationService from "../notifications/service";
import { bugboardMirrorReady, createBugIssue } from "@/lib/bugboardGithub";
import { auditLog } from "@/lib/audit";

export default class BugService {
    static async createBug(data) {
        const bug = {
            bugID: uuidv4(),
            title: data.title,
            description: data.description,
            stepsToReproduce: data.stepsToReproduce,
            severity: data.severity || 'low', // low, medium, high, critical
            status: 'open', // open, verified, rejected, fixed
            submittedBy: data.submittedBy,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        return await BugModel.createBug(bug);
    }

    static async getAllBugs(status, page = 1, limit = 20) {
        const filter = status ? { status } : {};
        const skip = (page - 1) * limit;
        const bugs = await BugModel.getAllBugs(filter, skip, limit);
        
        // Enrich with user info
        const allUsers = await UserModel.getAllUsers();
        const userMap = {};
        allUsers.forEach(u => {
            userMap[u.userID] = {
                username: u.username || u.firstName || "Unknown",
                image: u.image
            };
        });

        return bugs.map(bug => ({
            ...bug,
            submitterUsername: userMap[bug.submittedBy]?.username || bug.submittedBy,
            submitterImage: userMap[bug.submittedBy]?.image
        }));
    }

    static async updateBugStatus(bugID, status, adminID, stakeReward = 0) {
        const bug = await BugModel.getBugById(bugID);
        if (!bug) throw new Error("Bug not found");

        // Verify admin permissions (assumed to be checked by controller)

        const updateData = { status, verifiedBy: adminID };
        if (stakeReward > 0) {
            updateData.stakeReward = stakeReward;
        }

        await BugModel.updateBug(bugID, updateData);

        // If verified, handle rewards and badges
        if (status === 'verified') {
            const submitter = await UserModel.getUserByQuery({ userID: bug.submittedBy });
            if (submitter) {
                const userUpdates = {};
                let updated = false;

                // 1. Stake Reward
                if (stakeReward > 0) {
                    userUpdates.stake = (submitter.stake || 0) + Number(stakeReward);
                    
                    if (!userUpdates.$push) userUpdates.$push = {};
                    if (!userUpdates.$push.stakeHistory) userUpdates.$push.stakeHistory = { $each: [] };
                    
                    userUpdates.$push.stakeHistory.$each.push({
                        amount: Number(stakeReward),
                        reason: `Bug Bounty Reward: ${bug.title}`,
                        timestamp: new Date()
                    });

                    updated = true;
                }

                // 2. Bug Squasher Badge
                if (!submitter.badges?.includes(Constants.BADGES.BUG_SQUASHER.id)) {
                    userUpdates.badges = [...(submitter.badges || []), Constants.BADGES.BUG_SQUASHER.id];
                    // Add badge reward
                    userUpdates.stake = (userUpdates.stake || submitter.stake || 0) + Constants.BADGES.BUG_SQUASHER.stakeReward;
                    
                    if (!userUpdates.$push) userUpdates.$push = {};
                    if (!userUpdates.$push.stakeHistory) userUpdates.$push.stakeHistory = { $each: [] };
                    
                    userUpdates.$push.stakeHistory.$each.push({
                        amount: Constants.BADGES.BUG_SQUASHER.stakeReward,
                        reason: `Badge Earned: ${Constants.BADGES.BUG_SQUASHER.name}`,
                        timestamp: new Date()
                    });

                    updated = true;
                    
                    // Notify about badge
                    await NotificationService.create({
                        userID: bug.submittedBy,
                        type: 'success',
                        title: 'New Badge Earned!',
                        message: `You earned the "${Constants.BADGES.BUG_SQUASHER.name}" badge +${Constants.BADGES.BUG_SQUASHER.stakeReward} Stake!`,
                        link: `/dashboard/${bug.submittedBy}/profile`,
                        metadata: { badgeID: Constants.BADGES.BUG_SQUASHER.id }
                    });
                }

                if (updated) {
                    await UserModel.updateUser({ userID: bug.submittedBy }, userUpdates);
                }
            }

            // Additive, best-effort mirror of the verified bug to GitHub Issues (#137).
            // Self-contained + fail-closed: it NEVER throws into the verify path, so
            // stake/badges above are already committed regardless of the mirror outcome.
            await BugService.mirrorVerifiedBugToGithub(bug, submitter);
        }

        return { success: true };
    }

    /**
     * Mirror a verified bug to a GitHub issue (issue #137). Additive and
     * best-effort — the in-app board stays the source of truth.
     *
     * Guarantees:
     *  - Idempotent: if the bug already has a githubIssueNumber, no second issue
     *    is created (safe to re-verify).
     *  - Skipped when the mirror is unconfigured (no GITHUB_BUGBOARD_TOKEN), e.g.
     *    dev/local — the board works unchanged.
     *  - Fail-closed: any error is swallowed and audited SHAPE-ONLY (bugID + a
     *    short reason code, never the token or PII), leaving githubIssueNumber
     *    unset so a later re-verify can retry. It never breaks the verify action.
     *
     * @param {object} bug - the bug doc (pre-update; carries githubIssueNumber if mirrored)
     * @param {object|null} [submitter] - the submitter user doc, for USERNAME attribution
     * @returns {Promise<void>}
     */
    static async mirrorVerifiedBugToGithub(bug, submitter = null) {
        try {
            // Idempotent — one issue per bug, ever.
            if (bug?.githubIssueNumber) return;

            if (!bugboardMirrorReady()) {
                auditLog("bugboard.mirror.skipped", {
                    target: { bugID: bug?.bugID },
                    reason: "not_configured",
                });
                return;
            }

            // Attribute by USERNAME only (never email — the record has none and we
            // do not fetch it). submittedBy is a userID, a safe non-PII fallback.
            const submitterUsername =
                submitter?.username || submitter?.firstName || "unknown";

            const { number, url } = await createBugIssue({
                bugID: bug.bugID,
                title: bug.title,
                description: bug.description,
                submitterUsername,
            });

            await BugModel.updateBug(bug.bugID, {
                githubIssueNumber: number,
                githubIssueUrl: url,
            });

            auditLog("bugboard.mirror.created", {
                target: { bugID: bug.bugID, githubIssueNumber: number },
            });
        } catch (err) {
            // Shape-only audit: NO token, NO PII, NO stack — just bugID + a code.
            auditLog("bugboard.mirror.failed", {
                target: { bugID: bug?.bugID },
                outcome: "failure",
                reason: err?.code || err?.name || "error",
            });
        }
    }
}
