import axios from 'axios';

const ACCESS_CONTROL_API_URL = process.env.ACCESS_CONTROL_API_URL || 'http://localhost:3001';

/**
 * Sends an unlock command to a specific device via the WebSocket server.
 * @param {string} deviceId - The ID of the device to unlock (e.g., 'door-controller-01')
 * @returns {Promise<Object>} - The response from the server
 */
export async function unlockDoor(deviceId) {
  try {
    const response = await axios.post(`${ACCESS_CONTROL_API_URL}/api/unlock`, {
      deviceId,
    });
    return response.data;
  } catch (error) {
    console.error('Error unlocking door:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error || 'Failed to unlock door');
  }
}

/**
 * Sends a toggle light command to a specific device via the WebSocket server.
 * @param {string} deviceId - The ID of the device (e.g., 'door-controller-01')
 * @returns {Promise<Object>} - The response from the server
 */
export async function toggleLight(deviceId) {
  try {
    const response = await axios.post(`${ACCESS_CONTROL_API_URL}/api/toggle-light`, {
      deviceId,
    });
    return response.data;
  } catch (error) {
    console.error('Error toggling light:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error || 'Failed to toggle light');
  }
}

/**
 * Checks if a device is currently connected.
 * @param {string} deviceId 
 * @returns {Promise<boolean>}
 */
export async function getDeviceStatus(deviceId) {
    try {
        const response = await axios.get(`${ACCESS_CONTROL_API_URL}/api/status/${deviceId}`);
        return response.data.connected;
    } catch (error) {
        console.error('Error checking device status:', error.message);
        return false;
    }
}
