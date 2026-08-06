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

module.exports = { getClientIp, getDeviceInfo };
