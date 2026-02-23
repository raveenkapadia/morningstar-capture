// lib/auth.js
// Simple API key guard — all internal routes require x-api-key header

function requireAuth(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false;
  }

  const key = req.headers['x-api-key'] || req.query.key;

  if (!key || key !== process.env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorised — invalid or missing API key' });
    return false;
  }

  return true;
}

module.exports = { requireAuth };
