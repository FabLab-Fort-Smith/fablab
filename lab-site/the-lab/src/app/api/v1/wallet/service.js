// src/app/api/v1/wallet/service.js
import UserModel from "../users/model";

export default class WalletService {

    /**
     * Get the current stake balance for a user
     * @param {string} userID 
     * @returns {Promise<number>}
     */
    static async getBalance(userID) {
        const user = await UserModel.getUserByID(userID);
        if (!user) throw new Error("User not found");
        return user.stake || 0;
    }

    /**
     * Add stake to a user's wallet
     * @param {string} userID - User ID
     * @param {number} amount - Amount to add (must be positive)
     * @param {string} reason - Description for the history log
     * @param {string} type - Transaction type (e.g., 'reward', 'deposit', 'refund')
     * @param {Object} metadata - Optional metadata to store in history
     */
    static async addStake(userID, amount, reason, type, metadata = {}) {
        if (amount <= 0) throw new Error("Amount must be positive");

        const updateData = {
            $inc: { stake: amount },
            $push: {
                stakeHistory: {
                    amount,
                    reason,
                    timestamp: new Date(),
                    type,
                    ...metadata
                }
            }
        };

        const result = await UserModel.updateUser({ userID }, updateData);
        if (!result) throw new Error("Failed to update wallet");
        
        return { newBalance: (result.stake), amountAdded: amount };
    }

    /**
     * Deduct stake from a user's wallet
     * @param {string} userID - User ID
     * @param {number} amount - Amount to deduct (must be positive)
     * @param {string} reason - Description for the history log
     * @param {string} type - Transaction type (e.g., 'purchase', 'withdrawal', 'fee')
     * @param {Object} metadata - Optional metadata
     * @param {boolean} allowOverdraft - If true, balance can go negative (Admin use only generally)
     */
    static async deductStake(userID, amount, reason, type, metadata = {}, allowOverdraft = false) {
        if (amount <= 0) throw new Error("Amount must be positive");

        const user = await UserModel.getUserByID(userID);
        if (!user) throw new Error("User not found");

        const currentBalance = user.stake || 0;
        if (!allowOverdraft && currentBalance < amount) {
            throw new Error(`Insufficient funds: Balance ${currentBalance}, Required ${amount}`);
        }

        const updateData = {
            $inc: { stake: -amount },
            $push: {
                stakeHistory: {
                    amount: -amount,
                    reason,
                    timestamp: new Date(),
                    type,
                    ...metadata
                }
            }
        };

        const result = await UserModel.updateUser({ userID }, updateData);
        if (!result) throw new Error("Failed to update wallet");

        return { newBalance: result.stake, amountDeducted: amount };
    }

    /**
     * Transfer stake between users
     * @param {string} fromUserID - Sender
     * @param {string} toUserID - Receiver
     * @param {number} amount - Amount to transfer
     * @param {string} reason - Reason for transfer
     * @param {string} type - Transaction type (e.g., 'transfer', 'tip')
     */
    static async transferStake(fromUserID, toUserID, amount, reason, type = 'transfer') {
        if (fromUserID === toUserID) throw new Error("Cannot transfer to self");
        
        // 1. Deduct from Sender
        await this.deductStake(fromUserID, amount, `Sent to ${toUserID}: ${reason}`, `${type}_sent`, { receiverID: toUserID });

        // 2. Add to Receiver
        try {
            await this.addStake(toUserID, amount, `Received from ${fromUserID}: ${reason}`, `${type}_received`, { senderID: fromUserID });
        } catch (error) {
            // Rollback if receiver fails (Basic compensation transaction)
            console.error(`Transfer failed at receiver step. Rolling back ${fromUserID}`, error);
            await this.addStake(fromUserID, amount, `Refund (Failed Transfer): ${reason}`, 'refund', { originalType: type });
            throw new Error("Transfer failed. Funds returned to sender.");
        }

        return { success: true, amount };
    }
}
