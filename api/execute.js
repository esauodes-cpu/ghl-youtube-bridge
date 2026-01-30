export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: 405, errorMessage: "Method Not Allowed" });
  }

  const input = req.body || {};
  const method = String(input.method || "").toUpperCase();
  const url = String(input.url || "").trim();

  if (!method || !url) {
    return res.status(200).json({
      status: 400,
      headers: {},
      content: "",
      data: null,
      errorMessage: "Missing required fields: method or url",
      errorReason: "badRequest",
      request: { method, url }
    });
  }

  // ---- helpers
  const tryParseJson = (v) => {
    if (v == null) return null;
    if (typeof v === "object") return v;
    const s = String(v).trim();
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  };

  // query: expects JSON like {"part":"snippet","mine":"true"}
  const queryObj = tryParseJson(input.query) || {};

  // headers: expects JSON like {"accept":"application/json"}
  const userHeaders = tryParseJson(input.headers) || {};

  // body: expects JSON for POST/PUT/PATCH
  const bodyObj = tryParseJson(input.body);

  // ---- build url with query params
  const fullUrl = new URL(url);
  Object.entries(queryObj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fullUrl.searchParams.set(k, String(v));
  });

  // ---- authorization injected by GHL external auth (typically)
  const authHeader = req.headers["authorization"] || req.headers["Authorization"] || "";

  // ---- final headers
  const finalHeaders = {
    accept: "application/json",
    ...Object.fromEntries(
      Object.entries(userHeaders).map(([k, v]) => [String(k).toLowerCase(), String(v)])
    )
  };

  // Always enforce auth from GHL if present
  if (authHeader) finalHeaders["authorization"] = authHeader;

  const methodNeedsBody = ["POST", "PUT", "PATCH"].includes(method);
  let requestBody;

  if (methodNeedsBody && bodyObj != null) {
    requestBody = typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj);
    if (!finalHeaders["content-type"]) finalHeaders["content-type"] = "application/json";
  }

  // ---- do request
  let resp, text, parsed;
  try {
    resp = await fetch(fullUrl.toString(), {
      method,
      headers: finalHeaders,
      body: methodNeedsBody ? requestBody : undefined
    });

    text = await resp.text();
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  } catch (e) {
    return res.status(200).json({
      status: 500,
      headers: {},
      content: "",
      data: null,
      errorMessage: e.message || "Fetch failed",
      errorReason: "fetchError",
      request: {
        method,
        url: fullUrl.toString(),
        headers: { ...finalHeaders, authorization: authHeader ? "Bearer ***" : "" }
      }
    });
  }

  // ---- Convenience “official” fields (works across your 3 endpoints)
  const data = parsed;
  const items = data && Array.isArray(data.items) ? data.items : null;

  const firstItem = items && items[0] ? items[0] : null;
  const firstItemId = firstItem && firstItem.id ? firstItem.id : null;

  const id = (data && data.id) ? data.id : firstItemId;

  const title =
    (data && data.snippet && data.snippet.title) ||
    (firstItem && firstItem.snippet && firstItem.snippet.title) ||
    null;

  const scheduledStartTime =
    (data && data.snippet && data.snippet.scheduledStartTime) ||
    (firstItem && firstItem.snippet && firstItem.snippet.scheduledStartTime) ||
    null;

  const privacyStatus =
    (data && data.status && data.status.privacyStatus) ||
    (firstItem && firstItem.status && firstItem.status.privacyStatus) ||
    null;

  const lifeCycleStatus =
    (data && data.status && data.status.lifeCycleStatus) ||
    (firstItem && firstItem.status && firstItem.status.lifeCycleStatus) ||
    null;

  // YouTube error format: { error: { message, errors:[{reason,...}] } }
  const errorMessage =
    (data && data.error && data.error.message) ||
    (!resp.ok ? (text || resp.statusText || "Request failed") : null);

  const errorReason =
    (data && data.error && Array.isArray(data.error.errors) && data.error.errors[0] && data.error.errors[0].reason) ||
    (!resp.ok ? "youtubeError" : null);

  // ---- final wrapper response (stable)
  return res.status(200).json({
    status: resp.status,
    headers: Object.fromEntries(resp.headers.entries()),
    content: text || "",
    data: data ?? null,

    // “official-ish” convenience keys
    kind: data?.kind ?? null,
    etag: data?.etag ?? null,
    items: items,
    id,
    firstItemId,
    title,
    scheduledStartTime,
    privacyStatus,
    lifeCycleStatus,
    nextPageToken: data?.nextPageToken ?? null,
    pageInfo: data?.pageInfo ?? null,

    errorMessage,
    errorReason,

    request: {
      method,
      url: fullUrl.toString(),
      headers: { ...finalHeaders, authorization: authHeader ? "Bearer ***" : "" }
    }
  });
}
