import apiFetch from '@/utils/axiosInstance';

class RepairsService {
    static getRepairs = async () => {
        try {
            return await apiFetch('/repairs');
        } catch (error) {
            console.error("Error fetching repairs:", error);
            throw error;
        }
    };

    static getRepairById = async (repairID) => {
        try {
            return await apiFetch(`/repairs?repairID=${repairID}`);
        } catch (error) {
            console.error("Error fetching repair by ID:", error);
            throw error;
        }
    };

    static createRepair = async (repairData) => {
        try {
            return await apiFetch('/repairs', {
                method: 'POST',
                body: repairData, // FormData — Content-Type set automatically by browser
            });
        } catch (error) {
            console.error("Error creating repair:", error);
            throw error;
        }
    };

    static updateRepair = async (repairID, repairData) => {
        try {
            return await apiFetch(`/repairs?repairID=${repairID}`, {
                method: 'PUT',
                body: JSON.stringify(repairData),
            });
        } catch (error) {
            console.error("Error updating repair:", error);
            throw error;
        }
    };

    static deleteRepair = async (repairID) => {
        try {
            return await apiFetch(`/repairs?repairID=${repairID}`, { method: 'DELETE' });
        } catch (error) {
            console.error("Error deleting repair:", error);
            throw error;
        }
    };

    static addPart = async (repairID, partData) => {
        try {
            const combinedParts = partData.reduce((acc, part) => {
                const existing = acc.find(p => p.sku === part.sku);
                if (existing) {
                    existing.quantity += part.quantity;
                } else {
                    acc.push({ ...part });
                }
                return acc;
            }, []);

            for (const part of combinedParts) {
                await apiFetch('/repairs/parts', {
                    method: 'POST',
                    body: JSON.stringify({ repairID, part }),
                });
            }

            return { message: "All parts added successfully" };
        } catch (error) {
            console.error("Error adding part to repair:", error);
            throw error;
        }
    };

    static moveRepairStatus = async (repairIDs, status) => {
        try {
            return await apiFetch('/repairs/move', {
                method: 'PUT',
                body: JSON.stringify({ repairIDs, status }),
            });
        } catch (error) {
            console.error("Error moving repair status:", error);
            throw error;
        }
    };

    static updateQualityControl = async (qcData) => {
        try {
            return await apiFetch('/repairs/quality-control', {
                method: 'POST',
                body: qcData, // FormData — Content-Type set automatically by browser
            });
        } catch (error) {
            console.error("Error during Quality Control update:", error);
            throw error;
        }
    };
}

export default RepairsService;
