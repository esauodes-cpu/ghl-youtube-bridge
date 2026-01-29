export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 1. Get the YouTube Token GHL sent us automatically
  const youtubeToken = req.headers['authorization']; // GHL sends "Bearer [token]"
  
  // 2. Get the webinar data from the GHL Workflow
  const { webinarId, title, description } = req.body;

  try {
    // 3. Talk to YouTube's API
    const youtubeResponse = await fetch(`https://www.googleapis.com{webinarId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': youtubeToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: webinarId,
        snippet: {
          title: title,
          description: description
        }
      }),
    });

    const data = await youtubeResponse.json();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
