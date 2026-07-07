# Logging

Unified, leveled logging so debug data stays out of production and secrets/PII are redacted
centrally (CLAUDE.md §5/§9, topic-logging-observability, OWASP A09). **No raw `console.*` in app
code** — the `no-console` ESLint rule enforces this (a warning during the migration in #135, then
an error).

## Which logger
| Context | Import | Behavior |
|---|---|---|
| **Server** (route handlers, services, `auth.js`, libs) | `import logger from "@/lib/logger"` | pino: structured JSON to stdout, leveled, redacted |
| **Client** components | `import logger from "@/lib/logger.client"` | near-silent: dev-only `warn`/`error`, **nothing in prod** |
| **Security audit** events (who/what/outcome) | `import { auditLog } from "@/lib/audit"` | always-on, tamper-evident — not gated by level |

## Levels & when they emit
`error < warn < info < debug < trace`. Set with `LOG_LEVEL`. **Production defaults to `info`**, so
`debug`/`trace` are **silent in prod** unless you explicitly set `LOG_LEVEL=debug`. Use `debug` for
diagnostic detail freely — it won't ship in prod.

```js
import logger from "@/lib/logger";
logger.info({ orderId }, "order created");
logger.debug({ payload }, "raw upstream payload");   // silent in prod
logger.error({ err }, "checkout failed");
```

## Redaction (don't rely on it alone — still don't log secrets)
The server logger redacts sensitive keys at the boundary (`password`, `token`, `secret`,
`authorization`, `cookie`, `email`, `phone`, …) → `"[redacted]"`. Prefer passing **structured
fields** (`logger.info({ userId }, "...")`) over string interpolation so redaction can apply. For
identifiers you want to correlate without exposing, use `maskId()` from `@/lib/redact`.

## Rules
- Never log secrets, tokens, passwords, decrypted PII, or full request/profile/user objects.
- Client logging is minimal by design (the browser is untrusted); real client error *reporting*
  goes to a reporting service, not the console (future work).
- **Edge runtime** (middleware) can't use pino transports — use a console-JSON fallback there.
- Migrating off `console.*` is tracked in **#135**; when complete, `no-console` flips to `error`
  and (if needed) `serverExternalPackages: ['pino']` is added to `next.config.mjs`.
