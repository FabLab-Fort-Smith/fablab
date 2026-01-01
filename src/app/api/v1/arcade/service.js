import ArcadeModel from "./model";
import UserModel from "../users/model";
import DiscordService from "@/lib/discord";
import Constants from "@/lib/constants";
import { ObjectId } from "mongodb";

export default class ArcadeService {
    static GAME_COST = 5;
    static JACKPOT_AMOUNT = 3.5; // Increased from 2.5 (70% allocation)
    static MAX_REBATE = 1.0; // Max stake earned back per run
    static REBATE_THRESHOLD = 500; // Score needed for max rebate

    static async checkAndCycleJackpot() {
        const jackpot = await ArcadeModel.getCurrentJackpot();
        // If no jackpot exists, startGame will create one.
        // If jackpot exists, check if it's expired.
        if (jackpot && new Date() > new Date(jackpot.endDate)) {
            console.log("🎰 Jackpot expired! Processing winner...");

            // 1. Find Winner
            const topScores = await ArcadeModel.getTopScores('infinite_loop', 1, jackpot.startDate);
            
            if (topScores.length > 0) {
                const winnerSession = topScores[0];
                const winnerID = winnerSession.userID;
                const prize = jackpot.currentAmount;

                console.log(`🏆 Winner found: ${winnerID}, Prize: ${prize}`);

                // 2. Award Prize
                await UserModel.updateUser({ userID: winnerID }, {
                    $inc: { stake: prize },
                    $push: {
                        stakeHistory: {
                            amount: prize,
                            reason: `Weekly Jackpot Winner!`,
                            timestamp: new Date(),
                            type: 'jackpot_win'
                        }
                    }
                });

                // 3. Transfer Badge & Discord Role
                
                // A. Remove from previous winners
                const previousWinners = await UserModel.getUsersByBadge('top-runner');
                for (const user of previousWinners) {
                    if (user.discordId) {
                        await DiscordService.removeRole(user.discordId, Constants.TOP_RUNNER_ROLE_ID);
                    }
                }
                await UserModel.removeBadgeFromAll('top-runner');

                // B. Add to new winner
                const badge = {
                    id: 'top-runner',
                    name: 'Top Runner',
                    description: 'Awarded to the weekly Arcade Jackpot winner.',
                    icon: '👑',
                    awardedAt: new Date()
                };

                const winner = await UserModel.updateUser({ userID: winnerID }, {
                    $push: { badges: badge }
                });

                if (winner && winner.discordId) {
                    await DiscordService.addRole(winner.discordId, Constants.TOP_RUNNER_ROLE_ID);
                    await DiscordService.sendHackTheLabNotification(`👑 **New Arcade Champion!**\nCongratulations to **${winner.username}** for winning the Weekly Jackpot of **${prize} Stake**! They are now the **Top Runner**!`);
                }

                // 4. Close Jackpot
                await ArcadeModel.updateJackpot(jackpot._id, {
                    status: 'closed',
                    winnerID: winnerID,
                    closedAt: new Date()
                });

            } else {
                    awardedAt: new Date()
                };

                await UserModel.updateUser({ userID: winnerID }, {
                    $push: { badges: badge }
                });

                // 4. Close Jackpot
                await ArcadeModel.updateJackpot(jackpot._id, {
                    status: 'closed',
                    winnerID: winnerID,
                    closedAt: new Date()
                });

            } else {
                console.log("No winner found for jackpot.");
                // Close anyway
                await ArcadeModel.updateJackpot(jackpot._id, {
                    status: 'closed',
                    closedAt: new Date()
                });
            }
        }
    }

    static async startGame(userID, gameType = 'infinite_loop') {
        // 0. Check for Jackpot Cycle
        await this.checkAndCycleJackpot();

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
                avatar: user ? user.image : null,
                badges: user ? user.badges : []
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
