// CLIENT logger shim. The browser is untrusted and console output ships to the user's device,
// so this emits NOTHING in production and only surfaces warn/error in development. Never log
// PII/secrets client-side. (CLAUDE.md §5/§9.) For real client error reporting, route to a
// reporting service in a later iteration — not the console.
const isDev = process.env.NODE_ENV !== "production";
const noop = () => {};

/* eslint-disable no-console */
const clientLogger = isDev
  ? {
      error: (...args) => console.error(...args),
      warn: (...args) => console.warn(...args),
      info: (...args) => console.info(...args),
      debug: (...args) => console.debug(...args),
      trace: noop,
    }
  : { error: noop, warn: noop, info: noop, debug: noop, trace: noop };
/* eslint-enable no-console */

export default clientLogger;
