export default async function handler(req, res) {
  // GHL espera JSON; mejor responder 200 siempre para no romper el workflow runner
  if (req.method !== "POST") {
    return res.status(200).json({
      ok: false,
      apiStatus: 405,
      headers: { "content-type": "application/json; charset=UTF-8" },
      content: "",
      data: { error: { code: 405, message: "Method Not Allowed", errors: { "0": { reason: "method_not_allowed" } } } },
      errorMessage: "Method Not Allowed",
      errorReason: "method_not_allowed",
    });
  }

  // Soporta body como string o como objeto
  let payload = req.body || {};
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { payload = {}; }
  }

  // Body=Default en GHL => { data: {method,url,headers,query,body}, extras, meta }
  const input = payload.data || payload.inputData || payload || {};

  const { method, url, headers, query, body } = input;
  const auth = req.headers["authorization"] || req.headers["Authorization"]; // "Bearer xxx"

  if (!method || !url) {
    return res.status(200).json({
      ok: false,
      apiStatus: 400,
      headers: { "content-type": "application/json; charset=UTF-8" },
      content: "",
      data: {
        error: {
          code: 400,
          message: "Missing required fields: method or url",
          errors: { "0": { reason: "missing_required_fields", message: "Missing required fields: method or url" } }
        }
      },
      errorMessage: "Missing required fields: method or url",
      errorReason: "missing_required_fields",
    });
  }

  const safeJson = (v) => {
    if (v == null) return null;
    if (typeof v === "object") return v;
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch { return null; }
  };

  // Array -> Object: siempre index "0","1"... y agrega agrupadores útiles
  const arrayToKeyedObject = (arr) => {
    const out = {};
    arr.forEach((it, i) => { out[String(i)] = transformDeep(it); });

    // byId
    const byId = {};
    for (const it of arr) {
      if (it && typeof it === "object" && it.id != null) byId[String(it.id)] = transformDeep(it);
    }
    if (Object.keys(byId).length) out.byId = byId;

    // byReason (errores Google)
    const byReason = {};
    for (const it of arr) {
      if (it && typeof it === "object" && it.reason != null) byReason[String(it.reason)] = transformDeep(it);
    }
    if (Object.keys(byReason).length) out.byReason = byReason;

    // byName
    const byName = {};
    for (const it of arr) {
      if (it && typeof it === "object" && it.name != null) byName[String(it.name)] = transformDeep(it);
    }
    if (Object.keys(byName).length) out.byName = byName;

    return out;
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
  let fullUrl;
  try {
    // Permite pasar path relativo tipo "/youtube/v3/..." si quisieras
    const u = String(url).trim();
    const normalized = u.startsWith("/")
      ? `https://www.googleapis.com${u}`
      : u.startsWith("http")
        ? u
        : `https://www.googleapis.com/${u.replace(/^\/+/, "")}`;

    fullUrl = new URL(normalized);

    const q = safeJson(query);
    if (q && typeof q === "object") {
      for (const [k, v] of Object.entries(q)) {
        if (v === undefined || v === null || v === "") continue;
        fullUrl.searchParams.set(k, String(v));
      }
    }
  } catch (e) {
    return res.status(200).json({
      ok: false,
      apiStatus: 400,
      headers: { "content-type": "application/json; charset=UTF-8" },
      content: "",
      data: {
        error: {
          code: 400,
          message: "Invalid URL",
          errors: { "0": { reason: "invalid_url", message: e.message || "Invalid URL" } }
        }
      },
      errorMessage: "Invalid URL",
      errorReason: "invalid_url",
    });
  }

  // Headers hacia Google API
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
  if (needsBody) {
    const b = safeJson(body);
    if (b != null) {
      requestBody = JSON.stringify(b);
      if (!Object.keys(finalHeaders).some(k => k.toLowerCase() === "content-type")) {
        finalHeaders["Content-Type"] = "application/json";
      }
    } else if (typeof body === "string" && body.trim() !== "") {
      requestBody = body;
      if (!Object.keys(finalHeaders).some(k => k.toLowerCase() === "content-type")) {
        finalHeaders["Content-Type"] = "application/json";
      }
    } else {
      // body vacío: no mandamos nada (válido para bind)
      requestBody = undefined;
    }
  }

  try {
    const r = await fetch(fullUrl.toString(), {
      method: upperMethod,
      headers: finalHeaders,
      body: needsBody ? requestBody : undefined,
    });

    const text = await r.text();

    let parsed = null;
    try { parsed = text ? JSON.parse(text) : {}; }
    catch { parsed = { raw: text }; }

    const data = transformDeep(parsed);
    const responseHeaders = Object.fromEntries(r.headers.entries());

    // convenience fields (coinciden con tu sample)
    const firstItem = data?.items?.["0"] || null;

    const id = data?.id ?? firstItem?.id ?? null;
    const title = data?.snippet?.title ?? firstItem?.snippet?.title ?? null;
    const scheduledStartTime =
      data?.snippet?.scheduledStartTime ?? firstItem?.snippet?.scheduledStartTime ?? null;

    const privacyStatus =
      data?.status?.privacyStatus ?? firstItem?.status?.privacyStatus ?? null;

    const lifeCycleStatus =
      data?.status?.lifeCycleStatus ?? firstItem?.status?.lifeCycleStatus ?? null;

    const boundStreamId =
      data?.contentDetails?.boundStreamId ?? firstItem?.contentDetails?.boundStreamId ?? null;

    const embedHtml =
      data?.contentDetails?.monitorStream?.embedHtml ??
      firstItem?.contentDetails?.monitorStream?.embedHtml ??
      null;

    // Mantén compatibilidad con tus variables actuales (data.error.errors.0.*)
    const googleError = data?.error || null;
    const errorMessage = googleError?.errors?.["0"]?.message ?? googleError?.message ?? null;
    const errorReason = googleError?.errors?.["0"]?.reason ?? null;

    return res.status(200).json({
      ok: r.ok,
      apiStatus: r.status,
      headers: responseHeaders,          // tu variable usa headers.content-type (aquí viene como "content-type")
      content: text || "",               // raw string
      data,                              // JSON transformado

      // top-level convenience (como tu sample)
      id,
      title,
      scheduledStartTime,
      privacyStatus,
      lifeCycleStatus,
      boundStreamId,
      embedHtml,
      errorMessage: r.ok ? null : (errorMessage || (typeof data?.raw === "string" ? data.raw : null)),
      errorReason: r.ok ? null : errorReason,
    });

  } catch (e) {
    return res.status(200).json({
      ok: false,
      apiStatus: 500,
      headers: { "content-type": "application/json; charset=UTF-8" },
      content: "",
      data: {
        error: {
          code: 500,
          message: e.message || "bridge_error",
          errors: { "0": { reason: "bridge_error", message: e.message || "bridge_error" } }
        }
      },
      id: null,
      title: null,
      scheduledStartTime: null,
      privacyStatus: null,
      lifeCycleStatus: null,
      boundStreamId: null,
      embedHtml: null,
      errorMessage: e.message || "bridge_error",
      errorReason: "bridge_error",
    });
  }
}
