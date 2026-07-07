// Unified SERVER logger (CLAUDE.md §9 / topic-logging-observability). Structured JSON to stdout,
// leveled, with boundary redaction so secrets/PII never leak regardless of the call site.
//
// - Levels: error < warn < info < debug < trace. Production defaults to "info", so debug/trace
//   data is SILENT in prod unless LOG_LEVEL is explicitly set. No raw console.* in app code
//   (enforced by the `no-console` ESLint rule); use this logger instead.
// - Server/Node runtime only. CLIENT components import `@/lib/logger.client` (a near-silent
//   shim); do NOT import this module into client/edge bundles.
// - For security AUDIT events (who/what/outcome, always-on, tamper-evident) use `@/lib/audit`,
//   not this operational logger.
//
// Migration note: when route handlers/components start importing this, add
// `serverExternalPackages: ['pino']` to next.config.mjs if the bundler complains. See docs/logging.md.
import pino from "pino";

const level =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const logger = pino({
  level,
  base: { service: "the-lab" },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive keys at the boundary (defense in depth — a missed call site can't leak).
  redact: {
    paths: [
      "password", "*.password",
      "token", "*.token", "accessToken", "*.accessToken", "refreshToken", "*.refreshToken",
      "secret", "*.secret", "clientSecret", "*.clientSecret",
      "authorization", "*.authorization", "headers.authorization", "headers.cookie", "*.cookie",
      "apiKey", "*.apiKey", "api_key", "*.api_key",
      "email", "*.email", "phone", "*.phone", "phoneNumber", "*.phoneNumber",
    ],
    censor: "[redacted]",
  },
});

export default logger;
