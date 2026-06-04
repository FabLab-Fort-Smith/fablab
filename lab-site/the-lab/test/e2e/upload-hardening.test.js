// SEC-08: the S3 upload route was anonymous with no type/size validation, used
// the client filename as the object key, took ContentType from the client, and
// auto-created the bucket. These drive the route with auth + the S3 SDK mocked.
// They fail against the old route (no auth() call, no validation).

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@aws-sdk/client-s3", () => ({
    __esModule: true,
    S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ __type: "Put", input })),
    // Present so a regression that re-introduces auto-create would be caught.
    CreateBucketCommand: jest.fn().mockImplementation((input) => ({ __type: "Create", input })),
    HeadBucketCommand: jest.fn().mockImplementation((input) => ({ __type: "Head", input })),
}));

import { auth } from "@/auth";
import { S3Client, PutObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { POST, detectImageType } from "@/app/api/v1/upload/route";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

const fakeFile = (bytes, { type = "application/octet-stream", name = "f", size } = {}) => ({
    name,
    type,
    size: size ?? bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

const upload = (file) => POST({ formData: async () => ({ get: (k) => (k === "file" ? file : null) }) });

const ORIG = { bucket: process.env.S3_BUCKET_NAME, endpoint: process.env.S3_ENDPOINT };
beforeAll(() => {
    process.env.S3_BUCKET_NAME = "fablab-bounties";
    process.env.S3_ENDPOINT = "https://s3.crittercodes.dev";
});
afterAll(() => {
    process.env.S3_BUCKET_NAME = ORIG.bucket;
    process.env.S3_ENDPOINT = ORIG.endpoint;
});
beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue({ user: { userID: "u1", role: "user" } }); });

describe("detectImageType (content sniffing)", () => {
    test("recognizes png/jpeg by magic bytes", () => {
        expect(detectImageType(PNG).mime).toBe("image/png");
        expect(detectImageType(JPEG).mime).toBe("image/jpeg");
    });
    test("REGRESSION: rejects non-image content (HTML)", () => {
        expect(detectImageType(HTML)).toBeNull();
    });
});

describe("POST /api/v1/upload — SEC-08 hardening", () => {
    test("REGRESSION: anonymous -> 401 and nothing is uploaded", async () => {
        auth.mockResolvedValue(null);
        const res = await upload(fakeFile(PNG, { type: "image/png" }));
        expect(res.status).toBe(401);
        expect(PutObjectCommand).not.toHaveBeenCalled();
    });

    test("no file -> 400", async () => {
        const res = await upload(null);
        expect(res.status).toBe(400);
    });

    test("REGRESSION: a non-image (HTML with image content-type) -> 415, not uploaded", async () => {
        const res = await upload(fakeFile(HTML, { type: "image/png", name: "x.png" }));
        expect(res.status).toBe(415);
        expect(PutObjectCommand).not.toHaveBeenCalled();
    });

    test("REGRESSION: oversized file -> 413", async () => {
        const res = await upload(fakeFile(PNG, { type: "image/png", size: 6 * 1024 * 1024 }));
        expect(res.status).toBe(413);
        expect(PutObjectCommand).not.toHaveBeenCalled();
    });

    test("valid PNG -> 200, server key, validated ContentType, no bucket auto-create", async () => {
        const res = await upload(fakeFile(PNG, { type: "image/png", name: "../../etc/evil .png" }));
        expect(res.status).toBe(200);
        const { url } = await res.json();

        expect(PutObjectCommand).toHaveBeenCalledTimes(1);
        const params = PutObjectCommand.mock.calls[0][0];
        expect(params.ContentType).toBe("image/png");                 // from content, not client
        expect(params.Key).toMatch(/^uploads\/[0-9a-f-]{36}\.png$/);  // server-generated UUID key
        expect(params.Key).not.toContain("evil");                     // client filename ignored
        expect(params.Key).not.toContain("..");
        expect(url).toBe(`https://s3.crittercodes.dev/fablab-bounties/${params.Key}`);

        expect(CreateBucketCommand).not.toHaveBeenCalled();           // auto-create removed
    });

    test("REGRESSION: a client-mislabeled JPEG is stored with its true type", async () => {
        const res = await upload(fakeFile(JPEG, { type: "image/png", name: "a.png" }));
        expect(res.status).toBe(200);
        const params = PutObjectCommand.mock.calls[0][0];
        expect(params.ContentType).toBe("image/jpeg");
        expect(params.Key).toMatch(/\.jpg$/);
    });

    test("returns 500 when storage is unconfigured", async () => {
        const saved = process.env.S3_ENDPOINT;
        delete process.env.S3_ENDPOINT;
        const res = await upload(fakeFile(PNG, { type: "image/png" }));
        expect(res.status).toBe(500);
        process.env.S3_ENDPOINT = saved;
    });
});
