import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { GoogleGenAI } from '@google/genai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import BadgeModel from '../../badges/model';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const s3Client = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || 'https://s3.crittercodes.dev',
    forcePathStyle: true,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
    },
});

const BUCKET = process.env.S3_BUCKET_NAME || 'fablab-bounties';
const PUBLIC_ENDPOINT = 'https://s3.crittercodes.dev';

// Style: phosphor green terminal — pure black background, bright #00FF41 green glow,
// CRT scanline texture, flat minimal icon, subtle bloom, no other colors.
const STYLE = 'monochrome phosphor green terminal aesthetic, bright neon green #00FF41 icon on pure black background, CRT scanline texture, soft green bloom glow, flat minimal icon design, square badge composition, no other colors';

const BADGE_PROMPTS = {
    // ── General / Community ──────────────────────────────────────────────────
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
    // ── Season 1 — Hack The Lab ──────────────────────────────────────────────
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
    // ── Season 2 — The Syndicate ─────────────────────────────────────────────
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

async function generateAndUpload(ai, badgeId, prompt) {
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

    if (!imageBuffer) {
        throw new Error('No image data in Gemini response');
    }

    const key = `badges/${badgeId}-${Date.now()}.png`;
    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: imageBuffer,
        ContentType: 'image/png',
    }));

    return `${PUBLIC_ENDPOINT}/${BUCKET}/${key}`;
}

export async function POST(req) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
        }

        // Body options:
        //   {}                     → generate images for ALL badges in the DB
        //   { badgeId: "foo" }     → regenerate one specific badge
        //   { skipExisting: true } → skip badges that already have an imageUrl
        let singleBadgeId = null;
        let skipExisting = false;
        try {
            const body = await req.json();
            singleBadgeId = body?.badgeId ?? null;
            skipExisting = body?.skipExisting ?? false;
        } catch { /* empty body is fine */ }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        let badges;
        if (singleBadgeId) {
            const badge = await BadgeModel.getBadgeById(singleBadgeId);
            badges = badge ? [badge] : [];
        } else {
            badges = await BadgeModel.getAllBadges();
        }

        if (badges.length === 0) {
            return NextResponse.json({ error: 'No badges found in DB. Seed badges first.' }, { status: 404 });
        }

        const results = [];
        for (const badge of badges) {
            const { id: badgeId } = badge;

            if (skipExisting && badge.imageUrl) {
                results.push({ badgeId, status: 'skipped', reason: 'Already has image' });
                continue;
            }

            const prompt = BADGE_PROMPTS[badgeId] ?? buildFallbackPrompt(badge);

            try {
                const imageUrl = await generateAndUpload(ai, badgeId, prompt);
                await BadgeModel.updateBadge(badgeId, { imageUrl });
                results.push({ badgeId, status: 'ok', imageUrl });
            } catch (err) {
                results.push({ badgeId, status: 'error', error: err.message });
            }
        }

        const ok = results.filter(r => r.status === 'ok').length;
        const skipped = results.filter(r => r.status === 'skipped').length;
        const failed = results.filter(r => r.status === 'error').length;

        return NextResponse.json({
            message: `Badge image generation complete. OK: ${ok}, Skipped: ${skipped}, Failed: ${failed}.`,
            results,
        });
    } catch (error) {
        console.error('Badge image generation error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
