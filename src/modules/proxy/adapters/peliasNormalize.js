// Normalizes a Pelias-style GeoJSON FeatureCollection into our own stable
// public contract, so swapping the upstream geocoder later doesn't change
// what admin panel / mobile app clients receive.
function normalizeFeatureCollection(geojson, { withDistance = false } = {}) {
  const features = geojson?.features || [];
  return {
    results: features.map((f) => {
      const [lon, lat] = f.geometry?.coordinates || [null, null];
      const result = {
        label: f.properties?.label || f.properties?.name || '',
        lat,
        lon,
        type: f.properties?.layer || 'unknown',
        confidence: f.properties?.confidence ?? null,
      };
      if (withDistance && typeof f.properties?.distance === 'number') {
        result.distance = f.properties.distance;
      }
      return result;
    }),
  };
}

module.exports = { normalizeFeatureCollection };
