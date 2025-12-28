import UserModel from "@/app/api/v1/users/model";
import TransactionModel from "./model";

export default class TransactionService {
    
    /**
     * Process a tip between users
     * @param {string} senderId - User ID of sender
     * @param {string} receiverId - User ID of receiver (optional if discordId provided)
     * @param {number} amount - Amount to tip
     * @param {string} receiverDiscordId - Discord ID of receiver (if User ID unknown)
     */
    static processTip = async (senderId, amount, receiverId = null, receiverDiscordId = null) => {
        try {
            // 1. Validate Sender
            const sender = await UserModel.getUserByID(senderId);
            if (!sender) throw new Error("Sender not found");

            if (sender.stake < amount) {
                throw new Error("Insufficient stake");
            }

            // 2. Find Receiver
            let receiver = null;
            if (receiverId) {
                receiver = await UserModel.getUserByID(receiverId);
            } else if (receiverDiscordId) {
                // Try to find by Discord ID
                // Note: getUserByQuery uses regex, but for exact ID match we should be careful.
                // Ideally we'd have a specific method, but let's try this.
                // Actually, let's use the raw DB in UserModel if possible, but we can't access it here easily.
                // We'll use getUserByQuery with the exact string.
                receiver = await UserModel.getUserByQuery({ discordId: receiverDiscordId });
            }

            // 3. Deduct from Sender
            await UserModel.updateUser({ userID: senderId }, { $inc: { stake: -amount } });

            // 4. Handle Receiver
            if (receiver) {
                // Receiver exists, add stake immediately
                await UserModel.updateUser({ userID: receiver.userID }, { $inc: { stake: amount } });
                
                // Record Transaction
                await TransactionModel.createTransaction({
                    senderId: sender.userID,
                    receiverId: receiver.userID,
                    amount,
                    type: 'tip',
                    status: 'completed',
                    metadata: {
                        receiverDiscordId
                    }
                });

                return { status: 'completed', receiver };
            } else {
                // Receiver not found (Escrow)
                if (!receiverDiscordId) throw new Error("Receiver not identified");

                // Record Pending Transaction
                await TransactionModel.createTransaction({
                    senderId: sender.userID,
                    receiverId: null, // Unknown yet
                    amount,
                    type: 'tip',
                    status: 'pending',
                    metadata: {
                        receiverDiscordId
                    }
                });

                return { status: 'pending', receiver: null };
            }

        } catch (error) {
            console.error("Error processing tip:", error);
            throw error;
        }
    }

    /**
     * Award stake to a user (Admin only)
     * @param {string} adminId - Admin User ID
     * @param {string} receiverId - Receiver User ID
     * @param {number} amount - Amount to award
     * @param {string} reason - Reason for award
     */
    static awardStake = async (adminId, receiverId, amount, reason) => {
        try {
            const receiver = await UserModel.getUserByID(receiverId);
            if (!receiver) throw new Error("Receiver not found");

            // Add stake to receiver
            await UserModel.updateUser({ userID: receiverId }, { $inc: { stake: amount } });

            // Record Transaction
            await TransactionModel.createTransaction({
                senderId: adminId,
                receiverId: receiverId,
                amount,
                type: 'award',
                status: 'completed',
                metadata: {
                    reason
                }
            });

            return { status: 'completed', receiver };
        } catch (error) {
            console.error("Error awarding stake:", error);
            throw error;
        }
    }

    /**
     * Claim pending tips for a user who just linked Discord
     * @param {string} userId 
     * @param {string} discordId 
     */
    static claimPendingTips = async (userId, discordId) => {
        const pendingTxns = await TransactionModel.getPendingTipsForDiscordUser(discordId);
        
        let totalClaimed = 0;
        for (const txn of pendingTxns) {
            // Update transaction
            await TransactionModel.updateTransactionStatus(txn.transactionId, 'completed', { receiverId: userId });
            
            // Add stake to user
            await UserModel.updateUser({ userID: userId }, { $inc: { stake: txn.amount } });
            
            totalClaimed += txn.amount;
        }
        
        return totalClaimed;
    }
}
