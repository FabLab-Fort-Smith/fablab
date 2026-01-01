import ArcadeModel from "./model";
import UserModel from "../users/model";
import { ObjectId } from "mongodb";

export default class ArcadeService {
    static GAME_COST = 5;
    static JACKPOT_AMOUNT = 3.5; // Increased from 2.5 (70% allocation)
    static MAX_REBATE = 1.0; // Max stake earned back per run
    static REBATE_THRESHOLD = 500; // Score needed for max rebate

    static async startGame(userID, gameType = 'infinite_loop') {
        // 1. Validate User & Stake
        const user = await UserModel.getUserByID(userID);
        if (!user) throw new Error("User not found");
        if (user.stake < this.GAME_COST) throw new Error("Insufficient Stake");

        // 2. Get or Create Active Jackpot
        let jackpot = await ArcadeModel.getCurrentJackpot();
        if (!jackpot) {
            // Create new weekly jackpot
            const now = new Date();
            // Calculate next Sunday midnight
            const nextSunday = new Date();
            nextSunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
            nextSunday.setHours(23, 59, 59, 999);

            jackpot = {
                _id: `week_${now.getFullYear()}_${getWeekNumber(now)}`,
                currentAmount: 0,
                status: 'open',
                startDate: now,
                endDate: nextSunday
            };
            try {
                await ArcadeModel.createJackpot(jackpot);
            } catch (e) {
                // Handle race condition if created in parallel
                jackpot = await ArcadeModel.getCurrentJackpot();
            }
        }

        // 3. Deduct Stake (Burn & Jackpot)
        // We deduct the full cost from the user. 
        // The burn happens implicitly by not tracking it anywhere else.
        // The jackpot portion is tracked in the jackpot collection.
        await UserModel.updateUser({ userID }, {
            $inc: { stake: -this.GAME_COST },
            $push: {
                stakeHistory: {
                    amount: -this.GAME_COST,
                    reason: `Arcade: ${gameType}`,
                    timestamp: new Date(),
                    type: 'arcade_entry'
                }
            }
        });

        // 4. Add to Jackpot
        await ArcadeModel.addToJackpot(jackpot._id, this.JACKPOT_AMOUNT);

        // 5. Create Session
        const session = {
            userID,
            game: gameType,
            status: 'active',
            score: 0,
            stakePaid: this.GAME_COST,
            jackpotContribution: this.JACKPOT_AMOUNT,
            startedAt: new Date()
        };

        const createdSession = await ArcadeModel.createSession(session);

        return {
            sessionID: createdSession._id,
            currentJackpot: jackpot.currentAmount + this.JACKPOT_AMOUNT
        };
    }

    static async submitScore(sessionID, score) {
        const session = await ArcadeModel.getSessionById(sessionID);
        if (!session) throw new Error("Session not found");
        if (session.status !== 'active') throw new Error("Session already completed");

        // Calculate Rebate (Performance Reward)
        // Cap at MAX_REBATE (1.0)
        const rebate = Math.min(this.MAX_REBATE, (score / this.REBATE_THRESHOLD) * this.MAX_REBATE);
        const roundedRebate = Math.floor(rebate * 100) / 100; // Round to 2 decimals

        if (roundedRebate > 0) {
            await UserModel.updateUser({ userID: session.userID }, {
                $inc: { stake: roundedRebate },
                $push: {
                    stakeHistory: {
                        amount: roundedRebate,
                        reason: `Arcade Rebate: ${score} pts`,
                        timestamp: new Date(),
                        type: 'arcade_rebate'
                    }
                }
            });
        }

        await ArcadeModel.updateSession(sessionID, {
            status: 'completed',
            score: parseInt(score),
            rebate: roundedRebate,
            endedAt: new Date()
        });

        return { success: true, rebate: roundedRebate };
    }

    static async getJackpot() {
        const jackpot = await ArcadeModel.getCurrentJackpot();
        return jackpot || { currentAmount: 0 };
    }

    static async getLeaderboard(game = 'infinite_loop', type = 'all_time') {
        let startDate = null;

        if (type === 'weekly') {
            const jackpot = await ArcadeModel.getCurrentJackpot();
            if (jackpot) {
                startDate = jackpot.startDate;
            } else {
                // Fallback to start of week if no jackpot found
                const now = new Date();
                const day = now.getDay() || 7; // Get current day number, converting Sun. to 7
                if (day !== 1) now.setHours(-24 * (day - 1)); 
                now.setHours(0, 0, 0, 0);
                startDate = now;
            }
        }

        const scores = await ArcadeModel.getTopScores(game, 10, startDate);
        
        // Enrich with user data
        const enrichedScores = await Promise.all(scores.map(async (s) => {
            const user = await UserModel.getUserByID(s.userID);
            return {
                ...s,
                username: user ? user.username : 'Unknown',
                avatar: user ? user.image : null
            };
        }));

        return enrichedScores;
    }
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return weekNo;
}
