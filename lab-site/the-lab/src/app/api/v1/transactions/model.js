import { db } from "@/lib/database";
import { v4 as uuidv4 } from 'uuid';

export default class TransactionModel {
    /**
     * Create a new transaction
     * @param {Object} transaction 
     */
    static createTransaction = async (transaction) => {
        try {
            const dbTransactions = await db.dbTransactions();
            const newTransaction = {
                ...transaction,
                transactionId: `txn-${uuidv4()}`,
                createdAt: new Date(),
                status: transaction.status || 'completed'
            };
            
            const result = await dbTransactions.insertOne(newTransaction);
            if (!result.insertedId) {
                throw new Error("Failed to insert transaction");
            }
            return newTransaction;
        } catch (error) {
            console.error("Error creating transaction:", error);
            return null;
        }
    }

    /**
     * Get pending transactions for a specific Discord ID
     * @param {string} discordId 
     */
    static getPendingTipsForDiscordUser = async (discordId) => {
        try {
            const dbTransactions = await db.dbTransactions();
            return await dbTransactions.find({
                type: 'tip',
                status: 'pending',
                'metadata.receiverDiscordId': discordId
            }).toArray();
        } catch (error) {
            console.error("Error getting pending tips:", error);
            return [];
        }
    }

    /**
     * Update transaction status
     * @param {string} transactionId 
     * @param {string} status 
     * @param {Object} updates Additional updates
     */
    static updateTransactionStatus = async (transactionId, status, updates = {}) => {
        try {
            const dbTransactions = await db.dbTransactions();
            await dbTransactions.updateOne(
                { transactionId },
                { 
                    $set: { 
                        status, 
                        updatedAt: new Date(),
                        ...updates
                    } 
                }
            );
            return true;
        } catch (error) {
            console.error("Error updating transaction:", error);
            return false;
        }
    }
}
