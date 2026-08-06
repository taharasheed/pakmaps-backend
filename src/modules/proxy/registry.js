const { ApiService } = require('../../db/models');

const CACHE_TTL_MS = 10_000;
let cache = { data: null, expiresAt: 0 };

async function getAllServices({ fresh = false } = {}) {
  if (!fresh && cache.data && Date.now() < cache.expiresAt) return cache.data;
  const services = await ApiService.findAll();
  cache = { data: services, expiresAt: Date.now() + CACHE_TTL_MS };
  return services;
}

async function getServiceBySlug(slug) {
  const services = await getAllServices();
  return services.find((s) => s.slug === slug) || null;
}

function invalidate() {
  cache = { data: null, expiresAt: 0 };
}

module.exports = { getAllServices, getServiceBySlug, invalidate };
