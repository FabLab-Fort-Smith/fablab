import { WebSocketServer, WebSocket } from 'ws';
import express from 'express';
import { createServer } from 'http';
import bodyParser from 'body-parser';
import cors from 'cors';
import { verifyDeviceSecret, loadDeviceSecrets } from './lib/deviceAuth.js';
import { requireApiSecret } from './lib/apiAuth.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// Create HTTP server
const server = createServer(app);

// Store connected devices: Map<deviceId, { ws, ip, connectedAt }>
const devices = new Map();

// Device secrets are loaded from the DEVICE_SECRETS env var (JSON map of
// deviceId -> secret). No secrets are hardcoded (SEC-06); verification is
// constant-time — see ./lib/deviceAuth.js.
const configuredDeviceCount = Object.keys(loadDeviceSecrets()).length;
if (configuredDeviceCount === 0) {
    console.warn('⚠️ No DEVICE_SECRETS configured — all device authentication will be rejected.');
} else {
    console.log(`Loaded secrets for ${configuredDeviceCount} device(s).`);
}

// --- WebSocket Server ---
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WS] New connection from ${ip}`);
    let authenticatedDeviceId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'auth') {
                const { deviceId, secret } = data;

                if (verifyDeviceSecret(deviceId, secret)) {
                    authenticatedDeviceId = deviceId;
                    // Store extra metadata (ws + info)
                    devices.set(deviceId, { 
                        ws, 
                        ip, 
                        connectedAt: new Date().toISOString() 
                    });
                    console.log(`[WS] Device authenticated: ${deviceId}`);
                    ws.send(JSON.stringify({ status: 'authenticated', message: 'Welcome!' }));
                } else {
                    console.log(`[WS] Auth failed for device: ${deviceId}`);
                    ws.send(JSON.stringify({ status: 'error', message: 'Invalid credentials' }));
                    ws.close();
                }
            } else if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
            }

        } catch (e) {
            console.error('[WS] Error parsing message:', e);
        }
    });

    ws.on('close', () => {
        if (authenticatedDeviceId) {
            console.log(`[WS] Device disconnected: ${authenticatedDeviceId}`);
            devices.delete(authenticatedDeviceId);
        }
    });
});

// --- HTTP API for Web App ---

// Home Page - Dashboard (Read Only)
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>FabLab Access Control Server</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.5; }
            h1 { color: #333; }
            .status { padding: 1rem; border-radius: 8px; background: #f0f0f0; margin-bottom: 1rem; }
            .online { color: green; font-weight: bold; }
            .offline { color: red; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #ddd; }
            .meta { color: #666; font-size: 0.9em; }
        </style>
    </head>
    <body>
        <h1>FabLab Access Control Server</h1>
        <div class="status">
            Server Status: <span class="online">RUNNING</span><br>
            Port: ${PORT}
        </div>

        <h2>Connected Devices</h2>
        <table id="deviceTable">
            <thead>
                <tr>
                    <th>Device ID</th>
                    <th>Status</th>
                    <th>IP Address</th>
                    <th>Connected At</th>
                </tr>
            </thead>
            <tbody>
                <!-- Populated by JS -->
            </tbody>
        </table>

        <script>
            async function fetchDevices() {
                try {
                    const res = await fetch('/api/devices');
                    const devices = await res.json();
                    const tbody = document.querySelector('#deviceTable tbody');
                    tbody.innerHTML = '';

                    if (devices.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="4">No devices connected</td></tr>';
                        return;
                    }

                    devices.forEach(d => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = \`
                            <td>\${d.deviceId}</td>
                            <td><span class="online">ONLINE</span></td>
                            <td class="meta">\${d.ip || 'Unknown'}</td>
                            <td class="meta">\${d.connectedAt ? new Date(d.connectedAt).toLocaleString() : 'Just now'}</td>
                        \`;
                        tbody.appendChild(tr);
                    });
                } catch (e) {
                    console.error(e);
                }
            }

            // Poll every 2 seconds
            fetchDevices();
            setInterval(fetchDevices, 2000);
        </script>
    </body>
    </html>
    `);
});

// Endpoint to get all connected devices
app.get('/api/devices', (req, res) => {
    const connectedDevices = [];
    for (const [deviceId, data] of devices.entries()) {
        const ws = data.ws || data; // Handle mixed types if any
        if (ws.readyState === WebSocket.OPEN) {
            connectedDevices.push({ 
                deviceId,
                ip: data.ip || 'Unknown',
                connectedAt: data.connectedAt || null
            });
        }
    }
    res.json(connectedDevices);
});

// Endpoint to trigger unlock (Used by Next.js App)
app.post('/api/unlock', requireApiSecret, (req, res) => {
    const { deviceId } = req.body;

    if (!deviceId) {
        return res.status(400).json({ error: 'deviceId is required' });
    }

    const deviceData = devices.get(deviceId);
    const ws = deviceData ? (deviceData.ws || deviceData) : null;

    if (!ws) {
        return res.status(404).json({ error: 'Device not connected' });
    }

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command: 'UNLOCK' }));
        console.log(`[HTTP] Sent UNLOCK command to ${deviceId}`);
        return res.json({ success: true, message: 'Unlock command sent' });
    } else {
        return res.status(503).json({ error: 'Device connection is not open' });
    }
});

// Endpoint to toggle light (Used by Next.js App)
app.post('/api/toggle-light', requireApiSecret, (req, res) => {
    const { deviceId } = req.body;

    if (!deviceId) {
        return res.status(400).json({ error: 'deviceId is required' });
    }

    const deviceData = devices.get(deviceId);
    const ws = deviceData ? (deviceData.ws || deviceData) : null;

    if (!ws) {
        return res.status(404).json({ error: 'Device not connected' });
    }

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command: 'TOGGLE_LIGHT' }));
        console.log(`[HTTP] Sent TOGGLE_LIGHT command to ${deviceId}`);
        return res.json({ success: true, message: 'Toggle light command sent' });
    } else {
        return res.status(503).json({ error: 'Device connection is not open' });
    }
});

// Endpoint to get status of a device
app.get('/api/status/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    const data = devices.get(deviceId);
    const ws = data ? (data.ws || data) : null;
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    res.json({ deviceId, connected: isConnected });
});

// Healthcheck
app.get('/api/status/healthcheck', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
