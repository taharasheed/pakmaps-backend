const { UAParser } = require('ua-parser-js');

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || req.ip;
}

function getDeviceInfo(req) {
  const parser = new UAParser(req.headers['user-agent'] || '');
  const result = parser.getResult();
  return {
    browser: result.browser?.name || null,
    os: result.os?.name || null,
    device: result.device?.model || result.device?.type || 'Desktop',
  };
}

// Optional, best-effort location for any request - mobile and web alike.
// Sent as headers (not query/body) so it applies uniformly across GET and
// POST endpoints without touching every adapter's own validation schema.
// Never throws: a missing or malformed header just means no location, not
// a failed request.
function getClientLocation(req) {
  const lat = Number(req.headers['x-client-lat']);
  const lon = Number(req.headers['x-client-lon']);
  const valid = Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  return valid ? { lat, lon } : { lat: null, lon: null };
}

module.exports = { getClientIp, getDeviceInfo, getClientLocation };
