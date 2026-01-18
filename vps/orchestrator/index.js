const fastify = require('fastify')({ logger: true });
const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const DOMAIN = process.env.DOMAIN || 'localhost';
const SECRET = process.env.ORCHESTRATOR_SECRET;

// Auth Middleware
fastify.addHook('preHandler', async (request, reply) => {
    // Skip auth for health check
    if (request.url === '/health') return;

    const key = request.headers['x-service-key'];
    if (key !== SECRET) {
        reply.code(401).send({ error: 'Unauthorized' });
    }
});

fastify.get('/health', async (request, reply) => {
    return { status: 'ok' };
});

fastify.post('/mission/start', async (request, reply) => {
    const { userID, missionID, options } = request.body;
    
    if (!userID || !missionID) {
        return reply.code(400).send({ error: 'Missing userID or missionID' });
    }

    // Sanitize inputs
    const safeUserID = userID.replace(/[^a-zA-Z0-9]/g, '');
    const safeMissionID = missionID.replace(/[^a-zA-Z0-9-_]/g, '');
    
    const containerName = `mission-${safeUserID}-${safeMissionID}`;
    const hostRule = `${safeUserID}.${DOMAIN}`;
    const token = uuidv4(); // One-time token for ttyd

    try {
        // 1. Check if container exists
        try {
            const existing = docker.getContainer(containerName);
            const info = await existing.inspect();
            if (info.State.Running) {
                // If running, we might want to return the existing URL
                // But we don't know the token unless we stored it.
                // For now, let's kill and recreate to ensure fresh token access
                // Or we could store tokens in Redis.
                // Simpler approach: Kill and Restart.
                await existing.stop();
                await existing.remove();
            } else {
                await existing.remove();
            }
        } catch (e) {
            // Container doesn't exist, proceed
        }

        // 2. Ensure Volume Exists
        const volumeName = `data_${safeUserID}`;
        
        // 3. Run Container
        // Image name convention: crittercodes/mission-{missionID}:latest
        // For testing, we might default to a base image if missionID is generic
        const imageName = `crittercodes/${safeMissionID}:latest`;

        // Pull image if not present (optional, might slow things down)
        // await docker.pull(imageName);

        const container = await docker.createContainer({
            Image: imageName,
            name: containerName,
            Env: [
                `MISSION_FLAG=flag{placeholder}`,
                `TTYD_TOKEN=${token}`
            ],
            HostConfig: {
                Binds: [
                    `${volumeName}:/home/hacker/data`
                ],
                Memory: 256 * 1024 * 1024, // 256MB
                NanoCpus: 500000000, // 0.5 CPU
                NetworkMode: 'bridge' // Ensure it's on the same network as Traefik if needed, or default
            },
            Labels: {
                "traefik.enable": "true",
                [`traefik.http.routers.${containerName}.rule`]: `Host(\`${hostRule}\`)`,
                [`traefik.http.services.${containerName}.loadbalancer.server.port`]: "8080"
            },
            // ttyd command: port 8080, auth token, run bash
            Cmd: ["ttyd", "-p", "8080", "-t", `credential=token:${token}`, "bash"]
        });

        await container.start();

        // Connect to traefik network if defined in docker-compose
        // For now, assuming default bridge works or we need to explicitly connect
        // In a real setup, we'd put them on a 'web' network.

        return {
            status: 'created',
            containerID: container.id,
            url: `http://${hostRule}`, // Frontend should handle https upgrade
            token: token
        };

    } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ error: error.message });
    }
});

const start = async () => {
    try {
        await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();
