// Google-OAuth retirement campaign (docs/analysis/google-oauth-removal-impact.md §3/§6):
// the googleOnly classification decides who gets nudged, who gets the announcement
// email, and the removal gate count — so it is pinned here.
//
// A googleOnly account = googleId set AND discordId empty AND no usable password
// (the OAuth sentinel 'no password' does NOT count — password login rejects it).

import { authMethodsOf, NO_PASSWORD_SENTINEL } from '@/lib/authMethods';

describe('authMethodsOf', () => {
    test('googleOnly: google id, no discord, sentinel password', () => {
        const r = authMethodsOf({ googleId: 'g-1', discordId: '', password: NO_PASSWORD_SENTINEL });
        expect(r.googleOnly).toBe(true);
        expect(r.hasGoogle).toBe(true);
        expect(r.hasPassword).toBe(false);
        expect(r.hasDiscord).toBe(false);
        expect(r.methodCount).toBe(1);
    });

    test('the OAuth sentinel is never treated as a usable password', () => {
        expect(authMethodsOf({ password: NO_PASSWORD_SENTINEL }).hasPassword).toBe(false);
        expect(authMethodsOf({ password: 'no password' }).hasPassword).toBe(false);
        expect(authMethodsOf({ password: '$2b$10$realbcrypthash' }).hasPassword).toBe(true);
    });

    test('NOT googleOnly once a second credential exists', () => {
        expect(authMethodsOf({ googleId: 'g-1', discordId: 'd-1', password: NO_PASSWORD_SENTINEL }).googleOnly).toBe(false);
        expect(authMethodsOf({ googleId: 'g-1', discordId: '', password: '$2b$10$hash' }).googleOnly).toBe(false);
    });

    test('accounts without Google are never googleOnly', () => {
        expect(authMethodsOf({ discordId: 'd-1' }).googleOnly).toBe(false);
        expect(authMethodsOf({ password: '$2b$10$hash' }).googleOnly).toBe(false);
        expect(authMethodsOf({}).googleOnly).toBe(false);
    });

    test('absent / null / whitespace fields count as absent (no false positives)', () => {
        expect(authMethodsOf({ googleId: '   ', discordId: null }).hasGoogle).toBe(false);
        expect(authMethodsOf({ googleId: null }).googleOnly).toBe(false);
        expect(authMethodsOf({ googleId: 'g-1', discordId: '  ', password: '   ' }).googleOnly).toBe(true);
    });

    test('tolerates undefined / non-object input (fails closed, no throw)', () => {
        expect(() => authMethodsOf(undefined)).not.toThrow();
        expect(authMethodsOf(undefined).googleOnly).toBe(false);
        expect(authMethodsOf(null).methodCount).toBe(0);
    });
});
