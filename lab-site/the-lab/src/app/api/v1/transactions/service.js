import UserModel from "@/app/api/v1/users/model";
import TransactionModel from "./model";
import WalletService from "@/app/api/v1/wallet/service";

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

            // 2. Find Receiver
            let receiver = null;
            if (receiverId) {
                receiver = await UserModel.getUserByID(receiverId);
            } else if (receiverDiscordId) {
                receiver = await UserModel.getUserByQuery({ discordId: receiverDiscordId });
            }

            // 3. Process Transaction
            if (receiver) {
                // Direct Transfer
                await WalletService.transferStake(
                    senderId, 
                    receiver.userID, 
                    amount, 
                    `Tip from ${sender.username}`, 
                    'tip'
                );
                
                // Record Transaction Meta
                await TransactionModel.createTransaction({
                    senderId: sender.userID,
                    receiverId: receiver.userID,
                    amount,
                    type: 'tip',
                    status: 'completed',
                    metadata: { receiverDiscordId }
                });

                return { status: 'completed', receiver };
            } else {
                // Receiver not found (Escrow)
                if (!receiverDiscordId) throw new Error("Receiver not identified");

                // Deduct from Sender (Hold in Escrow)
                await WalletService.deductStake(
                    senderId, 
                    amount, 
                    `Tip to Discord User (Pending): ${receiverDiscordId}`, 
                    'tip_sent',
                    { receiverDiscordId }
                );

                // Record Pending Transaction
                await TransactionModel.createTransaction({
                    senderId: sender.userID,
                    receiverId: null, // Unknown yet
                    amount,
                    type: 'tip',
                    status: 'pending',
                    metadata: { receiverDiscordId }
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
    static awardStake = async (adminId, receiverId, amount, reason, receiverDiscordId = null) => {
        try {
            let receiver = null;
            if (receiverId) {
                receiver = await UserModel.getUserByID(receiverId);
            } else if (receiverDiscordId) {
                receiver = await UserModel.getUserByQuery({ discordId: receiverDiscordId });
            }

            if (receiver) {
                // Add stake to receiver
                await WalletService.addStake(
                    receiver.userID,
                    amount,
                    reason,
                    'award',
                    { senderId: adminId }
                );

                // Record Transaction
                await TransactionModel.createTransaction({
                    senderId: adminId,
                    receiverId: receiver.userID,
                    amount,
                    type: 'award',
                    status: 'completed',
                    metadata: { reason }
                });

                return { status: 'completed', receiver };
            } else {
                // Receiver not found (Escrow)
                if (!receiverDiscordId) throw new Error("Receiver not identified");

                // Note: Awards to unknown users via Discord ID are NOT held in escrow (staked isn't deducted from admin).
                // They just sit in pending transactions until claimed.

                // Record Pending Transaction
                await TransactionModel.createTransaction({
                    senderId: adminId,
                    receiverId: null,
                    amount,
                    type: 'award',
                    status: 'pending',
                    metadata: {
                        reason,
                        receiverDiscordId
                    }
                });

                return { status: 'pending', receiver: null };
            }
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
            await WalletService.addStake(
                userId,
                txn.amount,
                `Claimed ${txn.type} (from Discord Link)`,
                'claim_pending',
                { originalTxnId: txn.transactionId }
            );
            
            totalClaimed += txn.amount;
        }
        
        return totalClaimed;
    }
}
