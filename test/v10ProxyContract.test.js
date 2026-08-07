const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const autocomplete = require('../src/modules/proxy/adapters/autocomplete.adapter');
const search = require('../src/modules/proxy/adapters/search.adapter');
const reverse = require('../src/modules/proxy/adapters/reverseGeocoding.adapter');
const { isInternalRoutingCallback } = require('../src/modules/proxy/proxyAuth.middleware');

const service = { baseUrl: 'http://v10-gateway:4980' };
const request = {
  user: { id: '9cc68619-0472-0783-aa72-7bebd1d1947e' },
  headers: { 'accept-language': 'en-GB,en;q=0.9' },
};

test('Mapify public geocoding adapters call private V10 endpoints with affinity', () => {
  const autocompleteRequest = autocomplete.buildUpstreamRequest(
    { q: 'Doha', size: 10 }, service, request
  );
  const searchRequest = search.buildUpstreamRequest(
    { q: 'Doha', size: 10 }, service, request
  );
  const reverseRequest = reverse.buildUpstreamRequest(
    { lat: 25.2854, lon: 51.531, size: 1 }, service, request
  );

  assert.match(autocompleteRequest.url, /^http:\/\/v10-gateway:4980\/v10\/autocomplete\?/);
  assert.match(searchRequest.url, /^http:\/\/v10-gateway:4980\/v10\/search\?/);
  assert.match(reverseRequest.url, /^http:\/\/v10-gateway:4980\/v10\/reverse\?/);
  assert.equal(searchRequest.headers['x-authenticated-user'], request.user.id);
  assert.equal(searchRequest.headers['accept-language'], 'en-GB,en;q=0.9');
});

test('public response normalization removes all upstream engine metadata', () => {
  const upstream = {
    geocoding: {
      attribution: 'internal engine attribution',
      engine: 'internal-engine',
      mapify: { pelias_requests: 2 },
    },
    features: [{
      geometry: { coordinates: [51.531, 25.2854] },
      properties: {
        label: 'Doha, Qatar',
        layer: 'locality',
        confidence: 0.99,
        mapify_interpolation_evidence: { service: 'internal-engine' },
      },
    }],
  };

  const output = search.normalizeResponse(upstream);
  assert.deepEqual(output, {
    results: [{
      label: 'Doha, Qatar',
      lat: 25.2854,
      lon: 51.531,
      type: 'locality',
      confidence: 0.99,
    }],
  });
  assert.doesNotMatch(JSON.stringify(output), /pelias|engine|attribution/i);
});

test('private token authorization is limited to the exact routing callback', () => {
  assert.equal(isInternalRoutingCallback({
    method: 'POST',
    path: '/api/v1/proxy/routing',
    originalUrl: '/routing',
  }), true);
  assert.equal(isInternalRoutingCallback({
    method: 'POST',
    path: '/v1/proxy/routing',
    originalUrl: '/v1/proxy/routing?canary=1',
  }), true);
  assert.equal(isInternalRoutingCallback({
    method: 'POST',
    path: '/api/v1/proxy/search',
    originalUrl: '/api/v1/proxy/search',
  }), false);
  assert.equal(isInternalRoutingCallback({
    method: 'GET',
    path: '/routing',
    originalUrl: '/api/v1/proxy/routing',
  }), false);
  assert.equal(isInternalRoutingCallback({
    method: 'POST',
    path: '/routing-extra',
    originalUrl: '/api/v1/proxy/routing-extra',
  }), false);
});

test('proxy-specific authentication is mounted before the RBAC catch-all', () => {
  const routesSource = fs.readFileSync(
    path.join(__dirname, '../src/routes/index.js'),
    'utf8'
  );
  const proxyMount = routesSource.indexOf("router.use('/v1/proxy'");
  const rbacCatchAll = routesSource.indexOf("router.use('/',");
  assert.ok(proxyMount >= 0);
  assert.ok(rbacCatchAll >= 0);
  assert.ok(proxyMount < rbacCatchAll);
});
