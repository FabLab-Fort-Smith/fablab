const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3000';
const ORCHESTRATOR_SECRET = process.env.ORCHESTRATOR_SECRET || 'change_me_in_prod';

class OrchestratorService {
    static async startMission(userID, missionID) {
        try {
            const res = await fetch(`${ORCHESTRATOR_URL}/mission/start`, {
                method: 'POST',
                headers: {
                    'x-service-key': ORCHESTRATOR_SECRET,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userID, missionID, options: { duration: 3600 } }),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${text}`);
            }

            return res.json();
        } catch (error) {
            console.error("Error spawning mission:", error.message);
            throw new Error("Failed to start mission environment.");
        }
    }

    static async stopMission(userID) {
        // TODO: Implement stop endpoint in Orchestrator first
    }
}

export default OrchestratorService;
