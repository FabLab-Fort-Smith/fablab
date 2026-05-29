// SEC-09 e2e: drive the image-proxy route with the real SSRF guard and a mocked
// network. Proves the route refuses SSRF targets (and redirect-based SSRF) and
// still serves a legitimate allowlisted image.

import { GET } from "@/app/api/image-proxy/route";

const get = (url) => GET(new Request(`http://localhost/api/image-proxy?url=${encodeURIComponent(url)}`));
const imageResponse = (type = "image/png", bytes = [1, 2, 3]) =>
    new Response(Buffer.from(bytes), { status: 200, headers: { "content-type": type } });
const redirectTo = (location) => new Response(null, { status: 302, headers: { location } });

let fetchMock;
beforeEach(() => { fetchMock = jest.spyOn(global, "fetch"); });
afterEach(() => jest.restoreAllMocks());

describe("GET /api/image-proxy — SSRF hardening (SEC-09)", () => {
    test("missing url -> 400", async () => {
        expect((await GET(new Request("http://localhost/api/image-proxy"))).status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("REGRESSION: cloud-metadata URL -> 400 and never fetched", async () => {
        const res = await get("http://169.254.169.254/latest/meta-data/");
        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("REGRESSION: internal loopback URL -> 400 and never fetched", async () => {
        const res = await get("http://127.0.0.1:3001/admin");
        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("REGRESSION: non-allowlisted public host -> 400 and never fetched", async () => {
        const res = await get("https://evil.example.com/x.png");
        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("REGRESSION: a redirect to an internal host is blocked at the hop", async () => {
        fetchMock.mockResolvedValueOnce(redirectTo("http://169.254.169.254/latest/meta-data/"));
        const res = await get("https://cdn.discordapp.com/avatars/1/2.png");
        expect(res.status).toBe(400);
        expect(fetchMock).toHaveBeenCalledTimes(1); // never followed the redirect
    });

    test("allowlisted host serving an image -> 200 with passthrough content-type", async () => {
        fetchMock.mockResolvedValueOnce(imageResponse("image/png"));
        const res = await get("https://cdn.discordapp.com/avatars/1/2.png");
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/png");
        expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
    });

    test("a redirect to another allowlisted host is followed", async () => {
        fetchMock
            .mockResolvedValueOnce(redirectTo("https://lh3.googleusercontent.com/a/x"))
            .mockResolvedValueOnce(imageResponse("image/jpeg"));
        const res = await get("https://cdn.discordapp.com/avatars/1/2.png");
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test("allowlisted host returning a non-image -> 415", async () => {
        fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
        expect((await get("https://cdn.discordapp.com/x")).status).toBe(415);
    });

    test("oversized image (declared content-length) -> 413", async () => {
        fetchMock.mockResolvedValueOnce(new Response(Buffer.from([1]), {
            status: 200,
            headers: { "content-type": "image/png", "content-length": String(20 * 1024 * 1024) },
        }));
        expect((await get("https://cdn.discordapp.com/big.png")).status).toBe(413);
    });
});
