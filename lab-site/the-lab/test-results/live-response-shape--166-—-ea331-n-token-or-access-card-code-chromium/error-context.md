# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: live-response-shape.spec.js >> #166 — API responses carry no credentials or tokens >> /api/v1/users does not return the owner's verification token or access-card code
- Location: test/ux/live-response-shape.spec.js:66:9

# Error details

```
Error: stripSensitive() in src/app/api/v1/users/access.js removes only `password`. Still returned: user.membership.accessKey.code, user.verificationToken. §5 forbids returning verification/reset/session tokens; §3 classifies access-card codes as Restricted. See #166.

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 4

- Array []
+ Array [
+   "user.membership.accessKey.code",
+   "user.verificationToken",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - img "THE LAB" [ref=e7]
          - generic [ref=e8]:
            - generic [ref=e9]: THE.LAB
            - generic [ref=e10]: fab lab fort smith
        - generic [ref=e11]:
          - generic [ref=e12]: UH
          - generic [ref=e13]:
            - generic [ref=e14]: "@ux_harness"
            - generic [ref=e15]: ./member · active
      - generic [ref=e16]:
        - generic [ref=e17]:
          - generic [ref=e18]: ── me ─────
          - link "◉ home" [ref=e19] [cursor=pointer]:
            - /url: /dashboard/user-ux-harness
            - generic [ref=e20]: ◉
            - generic [ref=e21]: home
          - link "◊ profile" [ref=e22] [cursor=pointer]:
            - /url: /dashboard/user-ux-harness/profile
            - generic [ref=e23]: ◊
            - generic [ref=e24]: profile
          - link "§ stake.ledger" [ref=e25] [cursor=pointer]:
            - /url: /dashboard/user-ux-harness/stake
            - generic [ref=e26]: §
            - generic [ref=e27]: stake.ledger
          - link "✴ volunteer.log" [ref=e28] [cursor=pointer]:
            - /url: /dashboard/user-ux-harness/volunteer
            - generic [ref=e29]: ✴
            - generic [ref=e30]: volunteer.log
          - link "⚙ settings" [ref=e31] [cursor=pointer]:
            - /url: /dashboard/user-ux-harness/settings
            - generic [ref=e32]: ⚙
            - generic [ref=e33]: settings
          - link "⟁ checkin" [ref=e34] [cursor=pointer]:
            - /url: /dashboard/checkin
            - generic [ref=e35]: ⟁
            - generic [ref=e36]: checkin
          - link "$ plan.billing" [ref=e37] [cursor=pointer]:
            - /url: /dashboard/plans
            - generic [ref=e38]: $
            - generic [ref=e39]: plan.billing
          - link "⋬ unlock.door" [ref=e40] [cursor=pointer]:
            - /url: /unlock
            - generic [ref=e41]: ⋬
            - generic [ref=e42]: unlock.door
          - link "◐ onboarding" [ref=e43] [cursor=pointer]:
            - /url: /dashboard/onboarding
            - generic [ref=e44]: ◐
            - generic [ref=e45]: onboarding
        - generic [ref=e46]:
          - generic [ref=e47]: ── activities ─────
          - link "▶ arcade" [ref=e48] [cursor=pointer]:
            - /url: /dashboard/activities/arcade
            - generic [ref=e49]: ▶
            - generic [ref=e50]: arcade
          - link "◐ holodeck" [ref=e51] [cursor=pointer]:
            - /url: /dashboard/activities/holodeck
            - generic [ref=e52]: ◐
            - generic [ref=e53]: holodeck
          - link "⚑ leaderboard" [ref=e54] [cursor=pointer]:
            - /url: /dashboard/activities/leaderboard
            - generic [ref=e55]: ⚑
            - generic [ref=e56]: leaderboard
          - link "⚒ bounty.board" [ref=e57] [cursor=pointer]:
            - /url: /dashboard/activities/bounties
            - generic [ref=e58]: ⚒
            - generic [ref=e59]: bounty.board
        - generic [ref=e60]:
          - generic [ref=e61]: ── community ─────
          - link "⌬ feed" [ref=e62] [cursor=pointer]:
            - /url: /dashboard/community/feed
            - generic [ref=e63]: ⌬
            - generic [ref=e64]: feed
          - link "∷ directory" [ref=e65] [cursor=pointer]:
            - /url: /dashboard/community/directory
            - generic [ref=e66]: ∷
            - generic [ref=e67]: directory
          - link "✉ announcements" [ref=e68] [cursor=pointer]:
            - /url: /dashboard/community/announcements
            - generic [ref=e69]: ✉
            - generic [ref=e70]: announcements
          - link "§ conduct.md" [ref=e71] [cursor=pointer]:
            - /url: /dashboard/community/code-of-conduct
            - generic [ref=e72]: §
            - generic [ref=e73]: conduct.md
          - link "✦ showcase" [ref=e74] [cursor=pointer]:
            - /url: /dashboard/showcase
            - generic [ref=e75]: ✦
            - generic [ref=e76]: showcase
        - generic [ref=e77]:
          - generic [ref=e78]: ── resources ─────
          - link "▤ docs.tree" [ref=e79] [cursor=pointer]:
            - /url: /dashboard/resources
            - generic [ref=e80]: ▤
            - generic [ref=e81]: docs.tree
          - link "◈ my.badges" [ref=e82] [cursor=pointer]:
            - /url: /dashboard/resources/badges
            - generic [ref=e83]: ◈
            - generic [ref=e84]: my.badges
          - link "⚠ bug.board" [ref=e85] [cursor=pointer]:
            - /url: /dashboard/resources/bugs
            - generic [ref=e86]: ⚠
            - generic [ref=e87]: bug.board
        - generic [ref=e88]:
          - generic [ref=e89]: ── public ─────
          - link "○ public.home" [ref=e90] [cursor=pointer]:
            - /url: /
            - generic [ref=e91]: ○
            - generic [ref=e92]: public.home
          - link "$ donate" [ref=e93] [cursor=pointer]:
            - /url: /donate
            - generic [ref=e94]: $
            - generic [ref=e95]: donate
      - button "⏻ logout" [ref=e97] [cursor=pointer]:
        - generic [ref=e98]: ⏻
        - generic [ref=e99]: logout
      - generic [ref=e100]:
        - generic [ref=e101]:
          - generic [ref=e102]: build
          - generic [ref=e103]: dev
        - generic [ref=e104]:
          - generic [ref=e105]: env
          - generic [ref=e106]: production
        - generic [ref=e107]: ⌘K · search · run
    - generic [ref=e108]:
      - generic [ref=e109]:
        - generic [ref=e110]:
          - generic [ref=e111]: ~
          - generic [ref=e112]:
            - generic [ref=e113]: /
            - generic [ref=e114]: dashboard
          - generic [ref=e115]:
            - generic [ref=e116]: /
            - generic [ref=e117]: user-ux-harness
        - button "$ search · run · navigate… ⌘K" [ref=e118] [cursor=pointer]:
          - generic [ref=e119]: $
          - generic [ref=e120]: search · run · navigate…
          - generic [ref=e121]: ⌘K
        - generic [ref=e122]: 16:54:48
        - generic [ref=e123]:
          - button "☾" [ref=e125] [cursor=pointer]
          - generic [ref=e126]: user
      - generic [ref=e129]:
        - generic [ref=e130]:
          - generic [ref=e131]: $ whoami
          - heading "welcome, ux_harness." [level=1] [ref=e132]
        - generic [ref=e133]:
          - generic [ref=e134]:
            - generic [ref=e135]: NOT CHECKED IN
            - generic [ref=e138]: ready to make something?
          - generic [ref=e139]:
            - button "$ unlock & check in" [ref=e140] [cursor=pointer]
            - button "$ unlock lab" [ref=e141] [cursor=pointer]
        - group [ref=e142]:
          - generic "CO-OP_MEMBERSHIP_PROGRESS step 1/8 ▾" [ref=e143] [cursor=pointer]:
            - generic [ref=e144]: CO-OP_MEMBERSHIP_PROGRESS
            - generic [ref=e145]: step 1/8 ▾
        - generic [ref=e146]:
          - generic [ref=e147]: "> reminder: log your volunteer hours to stay in good standing. 4h/month required."
          - button "$ ./log-hours" [ref=e148] [cursor=pointer]
        - generic [ref=e149]:
          - generic [ref=e150]:
            - generic [ref=e151]: WAYS_TO_EARN_STAKE
            - generic [ref=e152]: 5 available
          - generic [ref=e156]:
            - generic [ref=e157]: ◎
            - generic [ref=e158]:
              - generic [ref=e159]: verify_email
              - generic [ref=e160]: Secure your account and earn stake.
            - generic [ref=e161]:
              - generic [ref=e162]: +10 stake
              - button "verify →" [ref=e163] [cursor=pointer]
              - button "×" [ref=e164] [cursor=pointer]
        - generic [ref=e165]:
          - generic [ref=e166]: QUICK_ACCESS
          - generic [ref=e167]:
            - generic [ref=e168] [cursor=pointer]:
              - generic [ref=e169]: ◈
              - generic [ref=e170]: profile
              - generic [ref=e171]: personal details
            - generic [ref=e172] [cursor=pointer]:
              - generic [ref=e173]: ⊞
              - generic [ref=e174]: membership
              - generic [ref=e175]: plans & billing
            - generic [ref=e176] [cursor=pointer]:
              - generic [ref=e177]: ⊡
              - generic [ref=e178]: bounties
              - generic [ref=e179]: earn credits
            - generic [ref=e180] [cursor=pointer]:
              - generic [ref=e181]: ◉
              - generic [ref=e182]: directory
              - generic [ref=e183]: find members
            - generic [ref=e184] [cursor=pointer]:
              - generic [ref=e185]: ◌
              - generic [ref=e186]: volunteer
              - generic [ref=e187]: log hours
            - generic [ref=e188] [cursor=pointer]:
              - generic [ref=e189]: ⊠
              - generic [ref=e190]: showcase
              - generic [ref=e191]: member projects
            - generic [ref=e192] [cursor=pointer]:
              - generic [ref=e193]: ★
              - generic [ref=e194]: badges
              - generic [ref=e195]: achievements
            - generic [ref=e196] [cursor=pointer]:
              - generic [ref=e197]: "!"
              - generic [ref=e198]: bug_tracker
              - generic [ref=e199]: report issues
            - generic [ref=e200] [cursor=pointer]:
              - generic [ref=e201]: "#"
              - generic [ref=e202]: support
              - generic [ref=e203]: get help
            - generic [ref=e204] [cursor=pointer]:
              - generic [ref=e205]: ▶
              - generic [ref=e206]: announcements
              - generic [ref=e207]: view all
  - alert [ref=e208]
```

# Test source

```ts
  1  | /**
  2  |  * response-shape gate (CLAUDE.md §7) — do the APIs the UI calls return fields they
  3  |  * shouldn't? §5 forbids returning tokens; §3 classifies access-card codes as
  4  |  * Restricted/PII with minimum-necessary exposure.
  5  |  *
  6  |  * Guards #166: stripSensitive() in src/app/api/v1/users/access.js removes only
  7  |  * `password`, so /api/v1/users returns the owner's live verificationToken (a JWT) and
  8  |  * membership.accessKey (the physical door credential) on every dashboard load.
  9  |  *
  10 |  * Needs a target and a session — see live-dashboard.spec.js.
  11 |  */
  12 | import fs from 'node:fs';
  13 | import { test, expect } from '@playwright/test';
  14 | import { SESSION_STATE_PATH } from './helpers/session-state.js';
  15 | 
  16 | const STATE = process.env.UX_STORAGE_STATE || SESSION_STATE_PATH;
  17 | const haveSession = fs.existsSync(STATE);
  18 | 
  19 | /**
  20 |  * Field names that must never appear in an API response body.
  21 |  *
  22 |  * Note `accessKey` itself is NOT here — the member UI legitimately needs to know whether a
  23 |  * key is issued, its type, and whether a card is paired. What must never cross the wire is
  24 |  * the card credential itself, `accessKey.code`, which is matched by key path below. Flagging
  25 |  * the container instead of the credential made this spec unsatisfiable without breaking the
  26 |  * UI, which is a good way to get a test deleted rather than a bug fixed.
  27 |  */
  28 | const FORBIDDEN = [
  29 |     'password', 'passwordHash', 'salt',
  30 |     'verificationToken', 'resetToken', 'sessionToken',
  31 | ];
  32 | 
  33 | /** Key paths that must never appear, matched on the full dotted path. */
  34 | const FORBIDDEN_PATHS = [
  35 |     /(^|\.)membership\.accessKey\.code$/,
  36 | ];
  37 | 
  38 | /**
  39 |  * Collect forbidden key paths from a decoded JSON body.
  40 |  * @param {unknown} node
  41 |  * @param {string} pathSoFar
  42 |  * @param {string[]} hits
  43 |  * @param {number} depth
  44 |  * @returns {string[]}
  45 |  */
  46 | function findForbidden(node, pathSoFar = '', hits = [], depth = 0) {
  47 |     if (depth > 6 || node === null || typeof node !== 'object') return hits;
  48 |     if (Array.isArray(node)) {
  49 |         if (node.length) findForbidden(node[0], `${pathSoFar}[]`, hits, depth + 1);
  50 |         return hits;
  51 |     }
  52 |     for (const [key, value] of Object.entries(node)) {
  53 |         const here = pathSoFar ? `${pathSoFar}.${key}` : key;
  54 |         if (FORBIDDEN.includes(key)) hits.push(here);
  55 |         else if (FORBIDDEN_PATHS.some((re) => re.test(here))) hits.push(here);
  56 |         if (value && typeof value === 'object') findForbidden(value, here, hits, depth + 1);
  57 |     }
  58 |     return hits;
  59 | }
  60 | 
  61 | test.describe('#166 — API responses carry no credentials or tokens', () => {
  62 |     test.skip(({ baseURL }) => !baseURL || !haveSession,
  63 |         'needs a target (UX_BASE_URL / UX_BOOT_LOCAL=1) and a session (UX_STORAGE_STATE / UX_SEED=1)');
  64 |     test.use({ storageState: haveSession ? STATE : undefined });
  65 | 
  66 |     test('/api/v1/users does not return the owner\'s verification token or access-card code', async ({ page }) => {
  67 |         await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  68 |         const session = await (await page.request.get('/api/auth/session')).json();
  69 |         const uid = session?.user?.userID;
  70 |         expect(uid, 'no session resolved — is the storageState token still valid?').toBeTruthy();
  71 | 
  72 |         const res = await page.request.get(`/api/v1/users?userID=${uid}`);
  73 |         expect(res.status()).toBe(200);
  74 |         const hits = findForbidden(await res.json());
  75 | 
  76 |         expect(
  77 |             hits,
  78 |             'stripSensitive() in src/app/api/v1/users/access.js removes only `password`. Still '
  79 |             + `returned: ${hits.join(', ')}. §5 forbids returning verification/reset/session `
  80 |             + 'tokens; §3 classifies access-card codes as Restricted. See #166.',
> 81 |         ).toEqual([]);
     |           ^ Error: stripSensitive() in src/app/api/v1/users/access.js removes only `password`. Still returned: user.membership.accessKey.code, user.verificationToken. §5 forbids returning verification/reset/session tokens; §3 classifies access-card codes as Restricted. See #166.
  82 |     });
  83 | 
  84 |     for (const endpoint of ['/api/v1/bounties', '/api/v1/announcements', '/api/v1/leaderboard', '/api/v1/feed', '/api/v1/badges']) {
  85 |         test(`${endpoint} response shape is clean`, async ({ page }) => {
  86 |             const res = await page.request.get(endpoint);
  87 |             expect(res.status()).toBeLessThan(400);
  88 |             expect(findForbidden(await res.json()), `${endpoint} leaks credential fields`).toEqual([]);
  89 |         });
  90 |     }
  91 | });
  92 | 
```