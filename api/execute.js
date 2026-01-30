export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  const { method, url, headers, query, body } = req.body || {};
  const auth = req.headers["authorization"]; // "Bearer xxx" (GHL lo manda)

  if (!method || !url) return res.status(400).json({ message: "Missing required fields: method or url" });

  const safeJson = (v) => {
    if (v == null) return null;
    if (typeof v === "object") return v;
    try { return JSON.parse(v); } catch { return null; }
  };

  // Array -> Object con key real (id/reason/name), si no, index
  const arrayToKeyedObject = (arr) => {
    // 1) id
    if (arr.every(x => x && typeof x === "object" && ("id" in x))) {
      const o = {};
      for (const it of arr) o[String(it.id)] = transformDeep(it);
      return o;
    }
    // 2) reason (YouTube errors)
    if (arr.every(x => x && typeof x === "object" && ("reason" in x))) {
      const o = {};
      for (const it of arr) o[String(it.reason)] = transformDeep(it);
      return o;
    }
    // 3) name
    if (arr.every(x => x && typeof x === "object" && ("name" in x))) {
      const o = {};
      for (const it of arr) o[String(it.name)] = transformDeep(it);
      return o;
    }
    // 4) fallback index
    const o = {};
    arr.forEach((it, i) => { o[String(i)] = transformDeep(it); });
    return o;
  };

  const transformDeep = (value) => {
    if (Array.isArray(value)) return arrayToKeyedObject(value);
    if (value && typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = transformDeep(v);
      return out;
    }
    return value;
  };

  // Build URL + query
  const fullUrl = new URL(url);
  const q = safeJson(query);
  if (q && typeof q === "object") {
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null) continue;
      fullUrl.searchParams.set(k, String(v));
    }
  }

  // Headers
  const h = safeJson(headers) || {};
  const finalHeaders = {
    ...(typeof h === "object" ? h : {}),
    ...(auth ? { Authorization: auth } : {}),
    Accept: "application/json",
  };

  // Body
  const upperMethod = String(method).toUpperCase();
  const needsBody = ["POST", "PUT", "PATCH"].includes(upperMethod);
  let requestBody = undefined;

  if (needsBody && body) {
    const b = safeJson(body);
    requestBody = b ? JSON.stringify(b) : String(body);
    if (!Object.keys(finalHeaders).some(k => k.toLowerCase() === "content-type")) {
      finalHeaders["Content-Type"] = "application/json";
    }
  }

  try {
    const r = await fetch(fullUrl.toString(), {
      method: upperMethod,
      headers: finalHeaders,
      body: needsBody ? requestBody : undefined,
    });

    const text = await r.text();
    let ytJson = null;
    try { ytJson = text ? JSON.parse(text) : {}; } catch { ytJson = { raw: text }; }

    // 🔥 aquí se convierte items[] -> items{<id>: {...}}
    const data = transformDeep(ytJson);

    return res.status(200).json({
      request: {
        method: upperMethod,
        url: fullUrl.toString(),
        headers: { ...finalHeaders, Authorization: auth ? "Bearer ***" : undefined },
        body: needsBody ? safeJson(body) ?? body ?? null : null
      },
      response: {
        status: r.status,
        headers: Object.fromEntries(r.headers.entries())
      },
      data
    });

  } catch (e) {
    return res.status(200).json({
      request: { method: upperMethod, url: fullUrl.toString() },
      response: { status: 500, headers: {} },
      data: {
        error: {
          code: 500,
          message: e.message,
          reason: "bridge_error"
        }
      }
    });
  }
}
