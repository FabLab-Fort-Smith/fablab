/**
 * Invoke a Next.js App Router route handler end-to-end and return the parsed
 * response. Exercises the real handler over a real Request/Response boundary.
 *
 * @param {Function} handler - the exported route function (GET/POST/PUT/...)
 * @param {object} [opts]
 * @param {string} [opts.method="GET"]
 * @param {string} [opts.url="http://localhost/api/test"]
 * @param {*}      [opts.body] - object (JSON-encoded) or raw string
 * @param {object} [opts.headers]
 * @returns {Promise<{status:number, json:any, text:string, headers:Headers}>}
 */
export async function callRoute(
  handler,
  { method = "GET", url = "http://localhost/api/test", body, headers = {} } = {}
) {
  const init = { method, headers: new Headers(headers) };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    if (!init.headers.has("content-type")) {
      init.headers.set("content-type", "application/json");
    }
  }
  const res = await handler(new Request(url, init));
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text, headers: res.headers };
}
