import { NextResponse } from 'next/server';
import { assertAllowedUrl } from '@/lib/ssrf';

// This route fetches a client-supplied URL, so it must defend against SSRF
// (SEC-09). Runs in the Node runtime for `net`-based IP checks in the guard.
export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

// Hosts this proxy is allowed to fetch from: our S3 bucket plus the OAuth avatar
// CDNs and seed-image host whose URLs we store on user/showcase records. A
// ".suffix" entry matches that domain and its subdomains. Extra hosts can be
// added per-environment via IMAGE_PROXY_ALLOWED_HOSTS (comma-separated).
function allowedHosts() {
    const hosts = [
        'cdn.discordapp.com',        // Discord avatars
        '.googleusercontent.com',    // Google avatars (lh3/lh4/...)
        'images.unsplash.com',       // seed/demo images
    ];
    if (process.env.S3_ENDPOINT) {
        try { hosts.push(new URL(process.env.S3_ENDPOINT).hostname); } catch { /* ignore malformed */ }
    }
    const extra = (process.env.IMAGE_PROXY_ALLOWED_HOSTS || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
    return [...hosts, ...extra];
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    const allow = allowedHosts();
    let target;
    try {
        target = assertAllowedUrl(imageUrl, allow);
    } catch {
        // Don't echo the reason — avoids confirming internal hosts to an attacker.
        return new NextResponse('URL not allowed', { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        // Follow redirects manually so each hop is re-validated against the
        // allowlist (an allowlisted host could otherwise 302 to an internal URL).
        let response;
        for (let hop = 0; ; hop++) {
            response = await fetch(target, { redirect: 'manual', signal: controller.signal });
            const isRedirect = response.status >= 300 && response.status < 400;
            const location = response.headers.get('location');
            if (!isRedirect || !location) break;
            if (hop >= MAX_REDIRECTS) {
                return new NextResponse('Too many redirects', { status: 502 });
            }
            try {
                target = assertAllowedUrl(new URL(location, target).href, allow);
            } catch {
                return new NextResponse('URL not allowed', { status: 400 });
            }
        }

        if (!response.ok) {
            return new NextResponse('Failed to fetch image', { status: 502 });
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            return new NextResponse('Unsupported content type', { status: 415 });
        }

        const declared = Number(response.headers.get('content-length') || 0);
        if (declared && declared > MAX_BYTES) {
            return new NextResponse('Image too large', { status: 413 });
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_BYTES) {
            return new NextResponse('Image too large', { status: 413 });
        }

        return new NextResponse(Buffer.from(buffer), {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        console.error('Error proxying image:', error?.message);
        return new NextResponse('Internal Server Error', { status: 500 });
    } finally {
        clearTimeout(timer);
    }
}
