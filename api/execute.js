export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, errorMessage: "Method Not Allowed" });
  }

  // ✅ IMPORTANTE: con "Body: Default" en GHL, los inputs llegan en req.body.data
  const payload = req.body?.data ?? req.body ?? {};
  const { method, url, headers, query, body } = payload;

  const auth = req.headers?.authorization; // lo manda GHL automático

  if (!method || !url) {
    return res.status(200).json({
      success: false,
      status: 400,
      errorMessage: "Missing required fields: method or url",
      errorReason: "badRequest",
      request: { method, url }
    });
  }

  const httpMethod = String(method).toUpperCase();
  const fullUrl = new URL(url);

  // query puede venir como string JSON
  try {
    const q = typeof query === "string" ? (query.trim() ? JSON.parse(query) : {}) : (query || {});
    for (const [k, v] of Object.entries(q)) fullUrl.searchParams.set(k, String(v));
  } catch (e) {}

  // headers puede venir como string JSON
  let userHeaders = {};
  try {
    userHeaders = typeof headers === "string" ? (headers.trim() ? JSON.parse(headers) : {}) : (headers || {});
  } catch (e) {}

  const finalHeaders = {
    accept: "application/json",
    ...(auth ? { authorization: auth } : {}),
    ...userHeaders
  };

  let requestBody;
  if (["POST", "PUT", "PATCH"].includes(httpMethod)) {
    try {
      const b = typeof body === "string" ? (body.trim() ? JSON.parse(body) : null) : (body ?? null);
      requestBody = b ? JSON.stringify(b) : undefined;
      if (requestBody) finalHeaders["content-type"] = "application/json";
    } catch (e) {}
  }

  try {
    const r = await fetch(fullUrl.toString(), {
      method: httpMethod,
      headers: finalHeaders,
      body: requestBody
    });

    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) {}

    const firstItem = Array.isArray(json?.items) && json.items[0] ? json.items[0] : null;

    return res.status(200).json({
      success: r.ok && !json?.error,
      status: r.status,
      headers: Object.fromEntries(r.headers.entries()),
      content: text,
      data: json,

      kind: json?.kind ?? null,
      etag: json?.etag ?? null,
      nextPageToken: json?.nextPageToken ?? null,
      pageInfo: json?.pageInfo ?? null,

      id: json?.id ?? firstItem?.id ?? null,
      firstItemId: firstItem?.id ?? null,

      title: firstItem?.snippet?.title ?? json?.snippet?.title ?? null,
      scheduledStartTime: firstItem?.snippet?.scheduledStartTime ?? json?.snippet?.scheduledStartTime ?? null,
      privacyStatus: firstItem?.status?.privacyStatus ?? json?.status?.privacyStatus ?? null,
      lifeCycleStatus: firstItem?.status?.lifeCycleStatus ?? json?.status?.lifeCycleStatus ?? null,

      errorMessage: json?.error?.message ?? null,
      errorReason: json?.error?.errors?.[0]?.reason ?? null,

      request: { method: httpMethod, url: fullUrl.toString() }
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      status: 500,
      errorMessage: err?.message ?? "Unknown error",
      errorReason: "serverError",
      request: { method: httpMethod, url: fullUrl.toString() }
    });
  }
}
