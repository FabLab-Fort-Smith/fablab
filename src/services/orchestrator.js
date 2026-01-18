import axios from 'axios';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3000'; // VPS IP in prod
const ORCHESTRATOR_SECRET = process.env.ORCHESTRATOR_SECRET || 'change_me_in_prod';

class OrchestratorService {
    /**
     * Spawns a mission container for a user
     * @param {string} userID - The user's ID
     * @param {string} missionID - The mission ID (e.g., 'mission-01')
     * @returns {Promise<{url: string, token: string, containerID: string}>}
     */
    static async startMission(userID, missionID) {
        try {
            console.log(`🚀 Spawning mission ${missionID} for user ${userID}...`);
            
            const response = await axios.post(`${ORCHESTRATOR_URL}/mission/start`, {
                userID,
                missionID,
                options: {
                    duration: 3600 // 1 hour default
                }
            }, {
                headers: {
                    'x-service-key': ORCHESTRATOR_SECRET,
                    'Content-Type': 'application/json'
                }
            });

            console.log("✅ Mission spawned successfully:", response.data);
            return response.data;
        } catch (error) {
            console.error("❌ Error spawning mission:", error.response?.data || error.message);
            throw new Error("Failed to start mission environment.");
        }
    }

    /**
     * Stops a mission container
     * @param {string} userID 
     */
    static async stopMission(userID) {
        // TODO: Implement stop endpoint in Orchestrator first
    }
}

export default OrchestratorService;
