const { Agent, fetch: undiciFetch } = require('undici');

// One pooled, keep-alive agent shared by every adapter's upstream calls -
// avoids a new TCP/TLS handshake per proxied request.
const agent = new Agent({
  connections: 256,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

async function upstreamFetch(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await undiciFetch(url, { ...options, dispatcher: agent, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { upstreamFetch };
