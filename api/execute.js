export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 1. Get data GHL sent in the POST body
  const { httpMethod, apiUrl, headers, query, body } = req.body;
  const youtubeToken = req.headers['authorization']; // Auto-added by GHL

  if (!httpMethod || !apiUrl) {
    return res.status(400).json({ message: 'Missing required fields: httpMethod or apiUrl' });
  }

  // 2. Prepare the request URL with query parameters
  const fullUrl = new URL(apiUrl);
  try {
    if (query) {
        const queryParams = typeof query === 'string' ? JSON.parse(query) : query;
        Object.keys(queryParams).forEach(key => fullUrl.searchParams.append(key, queryParams[key]));
    }
  } catch (e) {
    console.error("Failed to parse query JSON:", e);
  }


  // 3. Prepare headers, merging GHL's auth with user's custom headers
  let finalHeaders = {
    'Authorization': youtubeToken,
    'Content-Type': 'application/json', // Default for JSON APIs
    ... (typeof headers === 'string' ? JSON.parse(headers) : headers) // Add user's custom headers
  };
  
  // 4. Determine if a body is needed and parse it
  let requestBody = null;
  const methodRequiresBody = ['POST', 'PUT', 'PATCH'].includes(httpMethod.toUpperCase());
  if (methodRequiresBody && body) {
    try {
      requestBody = typeof body === 'string' ? JSON.parse(body) : body;
      requestBody = JSON.stringify(requestBody);
    } catch (e) {
      console.error("Failed to parse body JSON:", e);
    }
  }

  try {
    // 5. Make the dynamic API call to YouTube
    const youtubeResponse = await fetch(fullUrl.toString(), {
      method: httpMethod.toUpperCase(),
      headers: finalHeaders,
      body: requestBody,
    });

    const data = await youtubeResponse.json();
    return res.status(200).json({ success: true, data });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
