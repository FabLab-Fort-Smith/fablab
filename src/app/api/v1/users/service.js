// src/app/api/users/user.service.js

import User from "./class";
import UserModel from "./model";
import Constants from "@/lib/constants";
import AuthService from '../../auth/[...nextauth]/service.js';
import DiscordService from "@/lib/discord";
import NotificationService from "../notifications/service";
import { 
    sendApplicationReceivedEmail, 
    sendStatusChangeEmail, 
    sendProfileCompletionEmail,
    sendNudgeEmail,
    sendAdminNotificationEmail,
    sendVolunteerHoursApprovedEmail
} from "@/app/utils/email.util";

export default class UserService {
    /**
     * ✅ Create a new user
     * @param {Object} userData - The data required to create a user
     * @returns {Object|null} - Created user or null if failed
     */
    static createUser = async (userData) => {
        try {
            // Encrypt email and phone before creating a new user
            if(userData.email) userData.email = AuthService.encryptEmail(userData.email);
            if(userData.phoneNumber) userData.phoneNumber = AuthService.encryptPhone(userData.phoneNumber);
            userData.password = '';
            // Validate the required fields through the User class
            const newUser = new User(
                userData.firstName,
                userData.lastName,
                userData.username,
                userData.email,
                userData.password,
                userData.phoneNumber,
                userData?.role,
                userData?.status,
                userData?.provider,
                userData?.discordHandle,
                userData?.discordId,
                userData?.googleId,
                userData?.bio,
                userData?.skills,
                userData?.stake,
                userData?.image,
                userData?.boardPosition
            );
            return await UserModel.createUser(newUser);
        } catch (error) {
            console.error("Error in UserService.createUser:", error);
            throw new Error("Failed to create user.");
        }
    }

    /**
     * ✅ Fetch a user based on a query
     * @param {Object} query - The query to find a user
     * @returns {Object|null} - User data or null if not found
     */
    static getUserByQuery = async (query) => {
        try {
            // Encrypt email in query if present
            if (query.email) query.email = AuthService.encryptEmail(query.email);
            console.log("🔍 Fetching user in UserService for query:", query);
            const user = await UserModel.getUserByQuery(query); 
            if (user) {
                user.email = AuthService.decryptEmail(user.email);
                if (user.phoneNumber) user.phoneNumber = AuthService.decryptPhone(user.phoneNumber);
                console.log("✅ User found in service:", user);
            } else {
                console.warn("⚠️ No user found in service.");
            }
            return user;
        } catch (error) {
            console.error("❌ Error in UserService.getUserByQuery:", error);
            throw new Error("Failed to fetch user.");
        }
    }
    
    

    /**
     * ✅ Fetch all users
     * @param {Object} filters - Filter criteria
     * @param {number} page - Page number
     * @param {number} limit - Items per page
     * @returns {Object} - List of users and pagination info
     */
    static getAllUsers = async (filters = {}, page = 1, limit = 10) => {
        try {
            const skip = (page - 1) * limit;
            const users = await UserModel.getAllUsers(filters, skip, limit);
            const total = await UserModel.countUsers(filters);
            
            const decryptedUsers = users.map(user => {
                // Decrypt fields for each user
                user.email = AuthService.decryptEmail(user.email);
                if(user.phoneNumber) user.phoneNumber = AuthService.decryptPhone(user.phoneNumber);
                return user;
            });
            
            return { 
                users: decryptedUsers, 
                total, 
                page, 
                totalPages: Math.ceil(total / limit) 
            };
        } catch (error) {
            console.error("Error in UserService.getAllUsers:", error);
            throw new Error("Failed to fetch all users.");
        }
    }

    /**
     * ✅ Update a user's data
     * @param {Object} query - Query to find the user
     * @param {Object} updateData - Data to update
     * @returns {Object|null} - Updated user or null if failed
     */
    static updateUser = async (query, updateData) => {
        try {
            // Encrypt email and phone in updateData if present
            if(updateData.email) updateData.email = AuthService.encryptEmail(updateData.email);
            if(updateData.phoneNumber) updateData.phoneNumber = AuthService.encryptPhone(updateData.phoneNumber);

            // 1. Fetch current user to calculate new status
            // We construct a search query that matches UserModel.getUserByQuery logic
            const searchObj = {
                userID: query,
                email: query,
                username: query,
                phoneNumber: query,
                firstName: query,
                lastName: query
            };
            
            const currentUser = await UserModel.getUserByQuery(searchObj);
            
            // Check for profile completion reward
            if (currentUser && (!currentUser.bio || !currentUser.image)) {
                const willHaveBio = updateData.bio || currentUser.bio;
                const willHaveImage = updateData.image || currentUser.image;
                
                if (willHaveBio && willHaveImage) {
                     updateData.stake = (currentUser.stake || 0) + Constants.ONBOARDING_REWARDS.COMPLETE_PROFILE;
                }
            }

            // Track changes for notifications
            let statusChanged = false;
            let applicationSubmitted = false;
            let hasNewPendingLog = false;
            let approvedLogs = [];
            let oldStatus = currentUser?.membership?.status;
            let newStatus = oldStatus;

            if (currentUser && updateData.membership) {
                // Merge membership data
                const mergedMembership = {
                    ...currentUser.membership,
                    ...updateData.membership,
                    accessKey: {
                        ...(currentUser.membership?.accessKey || {}),
                        ...(updateData.membership?.accessKey || {})
                    }
                };

                // Check for volunteer log changes
                if (updateData.membership.volunteerLog) {
                    const oldLogs = currentUser.membership.volunteerLog || [];
                    const newLogs = updateData.membership.volunteerLog;
                    
                    // 1. Check for new pending logs (Admin Notification)
                    if (newLogs.length > oldLogs.length) {
                        const oldIds = new Set(oldLogs.map(l => l.id));
                        const addedLogs = newLogs.filter(l => !oldIds.has(l.id));
                        
                        if (addedLogs.some(l => l.status === 'pending')) {
                            hasNewPendingLog = true;
                        }
                    }

                    // 2. Check for approved logs (User Notification)
                    const oldLogMap = new Map(oldLogs.map(l => [l.id, l]));
                    for (const newLog of newLogs) {
                        const oldLog = oldLogMap.get(newLog.id);
                        // If it existed before as pending, and is now approved
                        if (oldLog && oldLog.status === 'pending' && newLog.status === 'approved') {
                            approvedLogs.push(newLog);
                        }
                    }

                    // 3. Check for Volunteer Star Badge (10+ Hours)
                    // Calculate total approved hours from the NEW state
                    const totalApprovedHours = newLogs
                        .filter(l => l.status === 'approved')
                        .reduce((acc, log) => acc + (Number(log.hours) || 0), 0);
                    
                    const currentBadges = updateData.badges || currentUser.badges || [];
                    if (totalApprovedHours >= 10 && !currentBadges.includes(Constants.BADGES.VOLUNTEER_STAR.id)) {
                        console.log(`🌟 Awarding Volunteer Star Badge to ${currentUser.userID}`);
                        updateData.badges = [...currentBadges, Constants.BADGES.VOLUNTEER_STAR.id];
                        
                        // Notify about badge
                        await NotificationService.create({
                            userID: currentUser.userID,
                            type: 'success',
                            title: 'New Badge Earned!',
                            message: `You earned the "${Constants.BADGES.VOLUNTEER_STAR.name}" badge for logging 10+ volunteer hours!`,
                            link: `/dashboard/${currentUser.userID}/profile`,
                            metadata: { badgeID: Constants.BADGES.VOLUNTEER_STAR.id }
                        });
                    }
                }

                // Check if application was just submitted
                if (!currentUser.membership?.applicationDate && mergedMembership.applicationDate) {
                    applicationSubmitted = true;
                    const currentStake = updateData.stake !== undefined ? updateData.stake : (currentUser.stake || 0);
                    updateData.stake = currentStake + Constants.ONBOARDING_REWARDS.SUBMIT_APPLICATION;
                }

                // Check if we should auto-update status
                const currentStatus = currentUser.membership?.status;
                const isManualStatus = currentStatus === 'probation' || currentStatus === 'suspended';
                
                // Only auto-calculate if not in a manual status, OR if the update explicitly changes status (which we can't easily detect here without comparing, but let's assume if they are in manual status we leave it unless they change it manually)
                // Actually, if the user is in probation, we shouldn't auto-promote them.
                
                if (!isManualStatus) {
                    newStatus = 'registered';
                    
                    if (mergedMembership.applicationDate) newStatus = 'applicant';
                    if (mergedMembership.contacted) newStatus = 'contacted';
                    if (mergedMembership.onboardingComplete) newStatus = 'onboarding';
                    
                    // Check for probation eligibility (Waived or Active Subscription)
                    const isMember = mergedMembership.isWaived || (mergedMembership.sponsorshipExpiresAt && new Date(mergedMembership.sponsorshipExpiresAt) > new Date());
                    if (mergedMembership.onboardingComplete && isMember) newStatus = 'probation';

                    if (mergedMembership.accessKey?.issued) newStatus = 'active';

                    // Update the status in the merged membership
                    mergedMembership.status = newStatus;
                }
                
                // Check if status changed (either by auto-calc or manual override in updateData)
                if (updateData.membership.status) {
                     // If manual override was provided, use it
                     newStatus = updateData.membership.status;
                }
                
                if (oldStatus !== newStatus) {
                    statusChanged = true;
                }

                // ✅ IMPORTANT: Update the updateData with the fully merged membership object
                // This prevents MongoDB from replacing the entire membership object with just the partial update
                updateData.membership = mergedMembership;
            }

            const updatedUser = await UserModel.updateUser(query, updateData);
            if(updatedUser) {
                updatedUser.email = AuthService.decryptEmail(updatedUser.email);
                if(updatedUser.phoneNumber) updatedUser.phoneNumber = AuthService.decryptPhone(updatedUser.phoneNumber);

                // ✅ Send Notifications
                if (applicationSubmitted) {
                    // Notify User
                    sendApplicationReceivedEmail(updatedUser.email, updatedUser.firstName).catch(console.error);
                    
                    // Notify Admin
                    sendAdminNotificationEmail(
                        "New Membership Application",
                        `${updatedUser.firstName} ${updatedUser.lastName} has submitted a new membership application. Please review it.`,
                        `${process.env.NEXT_PUBLIC_URL}/dashboard/onboarding-reviews`,
                        "Review Application"
                    ).catch(console.error);
                }

                if (hasNewPendingLog) {
                    // Notify Admin
                    sendAdminNotificationEmail(
                        "New Volunteer Hours Submitted",
                        `${updatedUser.firstName} ${updatedUser.lastName} has submitted new volunteer hours for approval.`,
                        `${process.env.NEXT_PUBLIC_URL}/dashboard/volunteers`,
                        "Review Hours"
                    ).catch(console.error);
                }

                if (statusChanged) {
                    sendStatusChangeEmail(updatedUser.email, updatedUser.firstName, newStatus).catch(console.error);

                    // If status changed to 'probation' (new member), send profile reminder AND notify admin to issue key
                    if (newStatus === 'probation') {
                        sendProfileCompletionEmail(updatedUser.email, updatedUser.firstName, updatedUser.userID).catch(console.error);
                        
                        // Notify Admin
                        sendAdminNotificationEmail(
                            "New Member - Access Key Needed",
                            `${updatedUser.firstName} ${updatedUser.lastName} has completed onboarding and payment. They are now a Probationary Member and need an Access Key issued.`,
                            `${process.env.NEXT_PUBLIC_URL}/dashboard/members`,
                            "Manage Member"
                        ).catch(console.error);
                    }
                }

                // 5. Send Volunteer Hours Approved Email (To User)
                if (approvedLogs.length > 0) {
                    // Send an email for each approved log
                    for (const log of approvedLogs) {
                        sendVolunteerHoursApprovedEmail(
                            updatedUser.email,
                            updatedUser.firstName,
                            log.hours,
                            log.description
                        ).catch(console.error);
                    }
                }

                // ✅ Sync Discord Roles
                if (updatedUser.discordId) {
                    // Sync Creator Types
                    if (updatedUser.creatorType) {
                        DiscordService.syncCreatorRoles(updatedUser.discordId, updatedUser.creatorType)
                            .catch(err => console.error("Background Creator Role Sync Failed:", err));
                    }
                    
                    // Sync Membership Role (LabRatz)
                    if (updatedUser.membership?.status) {
                        DiscordService.syncMembershipRole(updatedUser.discordId, updatedUser.membership.status)
                            .catch(err => console.error("Background Membership Role Sync Failed:", err));
                    }
                }
            }
            return updatedUser;
        } catch (error) {
            console.error("Error in UserService.updateUser:", error);
            throw new Error("Failed to update user.");
        }
    }

    /**
     * ✅ Delete a user
     * @param {Object} query - Query to identify the user
     * @returns {Boolean} - True if deletion was successful, false otherwise
     */
    static deleteUser = async (query) => {
        try {
            const deletionResult = await UserModel.deleteUser(query);
            return deletionResult;
        } catch (error) {
            console.error("Error in UserService.deleteUser:", error);
            throw new Error("Failed to delete user.");
        }
    }

    /**
     * ✅ Nudge a user based on their current status
     * @param {string} userID - The ID of the user to nudge
     * @param {boolean} preview - If true, returns the nudge details without sending email
     */
    static nudgeUser = async (userID, preview = false) => {
        try {
            const user = await this.getUserByQuery({ userID });
            if (!user) throw new Error("User not found");

            const status = user.membership?.status || 'registered';
            let step = '';
            let message = '';
            let actionLink = '';
            let actionText = '';

            switch (status) {
                case 'registered':
                    step = 'Complete Questionnaire';
                    message = 'We noticed you haven\'t completed your membership application yet. Tell us a bit about yourself to get started!';
                    actionLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/onboarding`;
                    actionText = 'Complete Questionnaire';
                    break;
                case 'contacted':
                    step = 'Schedule Orientation';
                    message = 'Your application has been approved! The next step is to schedule your safety orientation at the lab.';
                    actionLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/appointments`;
                    actionText = 'Schedule Orientation';
                    break;
                case 'onboarding':
                    // Check if they already have a subscription (even if status hasn't updated yet)
                    const hasSubscription = user.membership?.subscriptionStatus === 'ACTIVE' || 
                                          user.membership?.isWaived || 
                                          (user.membership?.sponsorshipExpiresAt && new Date(user.membership.sponsorshipExpiresAt) > new Date());

                    if (!hasSubscription) {
                        step = 'Subscribe to Membership';
                        message = 'You have completed your orientation! The final step is to select a membership plan and set up payment.';
                        actionLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/${userID}/profile?tab=1`;
                        actionText = 'Subscribe';
                        break;
                    }
                    // If they have a subscription, fall through to probation/active logic
                case 'probation':
                case 'active':
                    // 1. Check Profile Completion First
                    // We consider profile incomplete if bio or image is missing
                    if (!user.bio || !user.image) {
                        step = 'Complete Profile';
                        message = 'Make the most of your membership by completing your public profile. It helps other members find you for collaboration!';
                        actionLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/${userID}/profile`;
                        actionText = 'Edit Profile';
                        break; // Exit switch, send profile nudge
                    }

                    // 2. Check Volunteer Hours
                    const volunteerLogs = user.membership?.volunteerLog || [];
                    
                    const now = new Date();
                    const currentMonth = now.getMonth();
                    const currentYear = now.getFullYear();

                    const currentMonthLogs = volunteerLogs.filter(log => {
                        if (!log.date) return false;
                        const logDate = new Date(log.date);
                        return logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear;
                    });

                    const totalHours = currentMonthLogs.reduce((acc, log) => acc + (parseFloat(log.hours) || 0), 0);
                    const requiredHours = Constants.REQUIRED_VOLUNTEER_HOURS || 4;
                    const hoursNeeded = requiredHours - totalHours;

                    if (hoursNeeded > 0) {
                        step = 'Volunteer Hours Needed';
                        actionLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/bounties`;
                        actionText = 'View Bounties';

                        if (status === 'probation') {
                            // Probation specific message
                            if (totalHours === 0) {
                                message = `You haven't logged any volunteer hours this month. You need ${requiredHours} hours to qualify for your access key. Check out the available bounties!`;
                            } else {
                                message = `You're almost there! You only need ${hoursNeeded} more volunteer hour${hoursNeeded === 1 ? '' : 's'} to qualify for your access key.`;
                            }
                        } else {
                            // Active specific message
                            if (totalHours === 0) {
                                message = `You haven't logged any volunteer hours this month yet. You need ${requiredHours} hours every month to maintain your membership. Check out the available bounties!`;
                            } else {
                                message = `You're doing great! You only need ${hoursNeeded} more volunteer hour${hoursNeeded === 1 ? '' : 's'} to meet your monthly goal. Check out the bounties to finish up!`;
                            }
                        }
                    } else {
                        // Fallback if everything is good (maybe nudge to check events? or just profile again?)
                        // For now, let's default to profile but with a "All good" vibe? 
                        // Or actually, if they are all good, maybe we shouldn't nudge? 
                        // But the UI expects a nudge. Let's stick to Profile as a generic "keep it updated"
                        step = 'Update Profile';
                        message = 'Your membership is in good standing! Why not update your profile with your latest projects?';
                        actionLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/${userID}/profile`;
                        actionText = 'Edit Profile';
                    }
                    break;
                default:
                    throw new Error("No nudge action available for this status.");
            }

            if (preview) {
                return { 
                    success: true, 
                    preview: true,
                    details: {
                        step,
                        message,
                        actionLink,
                        actionText,
                        recipient: user.firstName
                    }
                };
            }

            if (user.email) {
                // Email is already decrypted by getUserByQuery
                await sendNudgeEmail(user.email, user.firstName, step, message, actionLink, actionText);
                return { success: true, message: `Nudge sent for ${step}` };
            }
            throw new Error("User has no valid email.");

        } catch (error) {
            console.error("Error in UserService.nudgeUser:", error);
            throw error;
        }
    }

    /**
     * ✅ Merge two users
     * Moves data from sourceUser to targetUser and deletes sourceUser
     * @param {string} targetUserID - The ID of the user to keep
     * @param {string} sourceUserID - The ID of the user to delete
     */
    static mergeUsers = async (targetUserID, sourceUserID) => {
        try {
            console.log(`🔀 Merging User ${sourceUserID} into ${targetUserID}`);
            
            const targetUser = await this.getUserByQuery({ userID: targetUserID });
            const sourceUser = await this.getUserByQuery({ userID: sourceUserID });

            if (!targetUser || !sourceUser) {
                throw new Error("One or both users not found.");
            }

            // Fields to copy if missing in target
            const fieldsToMerge = [
                'discordHandle', 'discordId', 'googleId', 'phoneNumber', 
                'firstName', 'lastName', 'image', 'bio', 'hobbies', 'creatorType',
                'cityChange', 'knownMembers', 'questions'
            ];

            const updateData = {};
            fieldsToMerge.forEach(field => {
                if (!targetUser[field] && sourceUser[field]) {
                    updateData[field] = sourceUser[field];
                }
            });

            // If source has a provider and target doesn't (or target is local), update provider
            if (sourceUser.provider && (!targetUser.provider || targetUser.provider === 'local')) {
                updateData.provider = sourceUser.provider;
            }

            // Update target user
            if (Object.keys(updateData).length > 0) {
                console.log("Updating target user with:", updateData);
                await this.updateUser(targetUserID, updateData);
            }

            // Delete source user
            console.log("Deleting source user:", sourceUserID);
            await this.deleteUser({ userID: sourceUserID });

            return await this.getUserByQuery({ userID: targetUserID });

        } catch (error) {
            console.error("❌ Error in UserService.mergeUsers:", error);
            throw error;
        }
    }
}
