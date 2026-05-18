#!/usr/bin/env node
/**
 * Seed S2 badges into MongoDB, then generate retro sci-fi holographic images
 * for ALL badges using Gemini Nano Banana (gemini-3.1-flash-image-preview).
 *
 * Usage:
 *   node scripts/seed-and-generate-badges.mjs
 *   node scripts/seed-and-generate-badges.mjs --skip-existing   (skip badges that already have imageUrl)
 *   node scripts/seed-and-generate-badges.mjs --seed-only
 *   node scripts/seed-and-generate-badges.mjs --images-only
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { GoogleGenAI } from '@google/genai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = resolve(__dirname, '../.env.local');
const envLines = readFileSync(envPath, 'utf8').split('\n');
for (const line of envLines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
}

// ── Config ────────────────────────────────────────────────────────────────────
const MONGODB_URI  = process.env.MONGODB_URI;
const MONGODB_NAME = process.env.MONGODB_NAME;
const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const BUCKET       = process.env.S3_BUCKET_NAME || 'fablab-bounties';
const PUBLIC_EP    = 'https://s3.crittercodes.dev';

const args = process.argv.slice(2);
const SKIP_EXISTING = args.includes('--skip-existing');
const SEED_ONLY     = args.includes('--seed-only');
const IMAGES_ONLY   = args.includes('--images-only');

// ── S2 Badge definitions ──────────────────────────────────────────────────────
const S2_BADGES = [
    { id: 'boot_agent',          name: 'Boot Agent',          icon: '🔄', description: "Survived VECTOR's opening move and read the environment.",              stakeReward: 15,   type: 'system' },
    { id: 'noise_filter',        name: 'Noise Filter',        icon: '📡', description: 'Cut through 50,000 Syndicate log entries to find the signal.',           stakeReward: 25,   type: 'system' },
    { id: 'fragment_hunter',     name: 'Fragment Hunter',     icon: '🧩', description: 'Recovered shredded evidence from 100 fragments using loops and find.',    stakeReward: 25,   type: 'system' },
    { id: 'code_surgeon',        name: 'Code Surgeon',        icon: '🩺', description: 'Repaired three bash scripts sabotaged by VECTOR.',                       stakeReward: 50,   type: 'system' },
    { id: 'signal_breaker',      name: 'Signal Breaker',      icon: '📻', description: 'Decoded triple-encoded Syndicate transmissions.',                        stakeReward: 50,   type: 'system' },
    { id: 'ghost_hunter',        name: 'Ghost Hunter',        icon: '👁️', description: "Exposed VECTOR's hidden persistence layer through /proc.",               stakeReward: 75,   type: 'system' },
    { id: 'pattern_analyst',     name: 'Pattern Analyst',     icon: '🔍', description: 'Identified VECTOR as a fully autonomous system through data analysis.',   stakeReward: 75,   type: 'system' },
    { id: 'regex_operative',     name: 'Regex Operative',     icon: '🔐', description: 'Cracked Syndicate pattern encoding with advanced regex.',                 stakeReward: 100,  type: 'system' },
    { id: 'automation_engineer', name: 'Automation Engineer', icon: '⚙️', description: "Built The Lab's professional-grade investigation toolkit.",               stakeReward: 150,  type: 'system' },
    { id: 'vector_slayer',       name: 'VECTOR Slayer',       icon: '🏆', description: 'Executed Operation Shutdown. VECTOR neutralized. The Lab stands.',        stakeReward: 500,  type: 'system' },
    { id: 'syndicate_buster',    name: 'Syndicate Buster',    icon: '🛡️', description: 'Completed all 10 Season 2 missions. The Syndicate falls.',               stakeReward: 1000, type: 'system' },
];

// ── Image prompts for every badge ─────────────────────────────────────────────
// Style: phosphor green terminal — pure black background, bright #00FF41 green glow,
// CRT scanline texture, flat minimal icon, subtle bloom, no other colors.
const STYLE = 'monochrome phosphor green terminal aesthetic, bright neon green #00FF41 icon on pure black background, CRT scanline texture, soft green bloom glow, flat minimal icon design, square badge composition, no other colors';

const BADGE_PROMPTS = {
    // General / Community
    founder:             `A rocket launching upward, founding pioneer crest, ${STYLE}`,
    bounty_hunter:       `A target crosshair locking onto a contract, ${STYLE}`,
    volunteer_star:      `A five-pointed star with a helping hand silhouette inside, ${STYLE}`,
    bug_squasher:        `A boot stomping a bug on a circuit board, sparks, ${STYLE}`,
    recovery_specialist: `A medical cross reconstructing a broken system core, ${STYLE}`,
    maker:               `A 3D printer, laser cutter, and soldering iron arranged as a crest, ${STYLE}`,
    trained_3d_printer:  `A 3D printer extruding an object with a certification seal, ${STYLE}`,
    trained_co2_laser:   `A CO2 laser beam cutting through material with a certification seal, ${STYLE}`,
    trained_fiber_laser: `A fiber optic bundle channeling a laser pulse with a certification seal, ${STYLE}`,
    showcase_pioneer:    `A spotlight illuminating a floating project on a pedestal with a pioneer ribbon, ${STYLE}`,
    community_voice:     `A megaphone broadcasting sound waves through a crowd, ${STYLE}`,
    lab_regular:         `A location pin on a lab floor plan with pulse rings, ${STYLE}`,
    // Season 1 — Hack The Lab
    script_kiddie:       `A laptop with a terminal window showing a captured flag, ${STYLE}`,
    white_hat:           `A hacker hat floating above a system flag, ${STYLE}`,
    elite_hacker:        `An alien skull overlaid with circuit patterns, ${STYLE}`,
    system_admin:        `A shield protecting a mainframe tower, ${STYLE}`,
    historian:           `An ancient scroll unrolling to reveal digital data, ${STYLE}`,
    phreaker:            `A vintage telephone handset with signal waves radiating outward, ${STYLE}`,
    insider:             `A spy silhouette holding classified documents, ${STYLE}`,
    network_engineer:    `A network topology map with nodes and connections, ${STYLE}`,
    remote_operator:     `A satellite dish beaming data to a remote terminal, ${STYLE}`,
    dba:                 `A database cylinder being unlocked and queried, ${STYLE}`,
    rootkit_master:      `A skull wearing a root access crown, ${STYLE}`,
    virus_hunter:        `A microscope scanning and neutralizing a digital virus particle, ${STYLE}`,
    hardware_hacker:     `A hand plugging into a physical control board with circuits lighting up, ${STYLE}`,
    ai_whisperer:        `A human silhouette communicating with an AI neural brain, ${STYLE}`,
    forensic_accountant: `A money trail flowing through a ledger with a forensic magnifier, ${STYLE}`,
    web_exploiter:       `A spider crawling through a web backdoor portal, ${STYLE}`,
    bomb_squad:          `A logic bomb timer being defused with wire cutters, ${STYLE}`,
    reverse_engineer:    `A binary DNA helix being unwound and analyzed, ${STYLE}`,
    ghost_buster:        `A ghost process trapped inside a containment field, ${STYLE}`,
    easter_egg_hunter:   `An easter egg cracking open to reveal hidden data inside, ${STYLE}`,
    // Season 2 — The Syndicate
    boot_agent:          `A boot sequence screen with cascading terminal text and a circular agent emblem, ${STYLE}`,
    noise_filter:        `A radio dish scanning through static noise with signal waves cutting through, ${STYLE}`,
    fragment_hunter:     `A puzzle piece assembling from scattered digital shards floating in void, ${STYLE}`,
    code_surgeon:        `A scalpel dissecting a circuit board with surgical precision, ${STYLE}`,
    signal_breaker:      `A signal tower with cipher waves shattering outward, ${STYLE}`,
    ghost_hunter:        `An eye scanning through process trees with spectral processes revealed, ${STYLE}`,
    pattern_analyst:     `A magnifying glass over streaming data revealing an AI neural network, ${STYLE}`,
    regex_operative:     `A lock unlocking via flowing regex pattern strings forming a key shape, ${STYLE}`,
    automation_engineer: `Gears and scripts assembling into an autonomous machine toolkit, ${STYLE}`,
    vector_slayer:       `A trophy with a slashed neural network emblem and circuit debris, ${STYLE}`,
    syndicate_buster:    `A shield emblazoned with a broken syndicate sigil, triumphant energy radiating outward, ${STYLE}`,
};

function buildFallbackPrompt(badge) {
    return `A minimal icon for "${badge.name}" — ${badge.description}, ${STYLE}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function ok(msg)  { console.log(`  ✓ ${msg}`); }
function skip(msg){ console.log(`  – ${msg}`); }
function fail(msg){ console.error(`  ✗ ${msg}`); }

// ── Phase 1: Seed S2 badges ───────────────────────────────────────────────────
async function seedBadges(col) {
    log('=== PHASE 1: Seeding S2 badges ===');
    let created = 0, skipped = 0;

    for (const badge of S2_BADGES) {
        const existing = await col.findOne({ id: badge.id });
        if (existing) {
            skip(`${badge.id} — already exists`);
            skipped++;
        } else {
            await col.insertOne({ ...badge, imageUrl: null, createdAt: new Date(), updatedAt: new Date() });
            ok(`${badge.id} — created`);
            created++;
        }
    }

    log(`Seed complete. Created: ${created}, Skipped: ${skipped}\n`);
}

// ── Phase 2: Generate images ──────────────────────────────────────────────────
async function generateImages(col, ai) {
    log('=== PHASE 2: Generating badge images ===');

    const s3 = new S3Client({
        region: process.env.S3_REGION || 'us-east-1',
        endpoint: process.env.S3_ENDPOINT || 'https://s3.crittercodes.dev',
        forcePathStyle: true,
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
        },
    });

    const badges = await col.find({}).toArray();
    log(`Found ${badges.length} badges in DB`);

    let genOk = 0, genSkip = 0, genFail = 0;

    for (const badge of badges) {
        const { id } = badge;

        if (SKIP_EXISTING && badge.imageUrl) {
            skip(`${id} — already has image`);
            genSkip++;
            continue;
        }

        const prompt = BADGE_PROMPTS[id] ?? buildFallbackPrompt(badge);

        try {
            log(`Generating image for: ${id}`);
            const response = await ai.models.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: prompt,
                config: { responseModalities: ['IMAGE'] },
            });

            let imageBuffer = null;
            for (const part of response.candidates?.[0]?.content?.parts ?? []) {
                if (part.inlineData?.data) {
                    imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                    break;
                }
            }

            if (!imageBuffer) throw new Error('No image data returned by Gemini');

            const key = `badges/${id}-${Date.now()}.png`;
            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: imageBuffer,
                ContentType: 'image/png',
            }));

            const imageUrl = `${PUBLIC_EP}/${BUCKET}/${key}`;
            await col.updateOne({ id }, { $set: { imageUrl, updatedAt: new Date() } });
            ok(`${id} → ${imageUrl}`);
            genOk++;
        } catch (err) {
            fail(`${id}: ${err.message}`);
            genFail++;
        }
    }

    log(`\nImage generation complete. OK: ${genOk}, Skipped: ${genSkip}, Failed: ${genFail}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }
    if (!GEMINI_KEY && !SEED_ONLY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const col = client.db(MONGODB_NAME).collection('badges');
    log(`Connected to MongoDB: ${MONGODB_NAME}`);

    if (!IMAGES_ONLY) await seedBadges(col);

    if (!SEED_ONLY) {
        const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
        await generateImages(col, ai);
    }

    await client.close();
    log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
