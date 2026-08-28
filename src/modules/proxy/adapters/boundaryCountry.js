const { iso1A2Code } = require('@rapideditor/country-coder');

// Shared by search.adapter.js and autocomplete.adapter.js: the upstream's
// focus.point.lat/lon only biases ranking, it doesn't restrict results to a
// country (a same-named place in another country still comes back) -
// boundary.country is the one upstream param that actually filters. When the
// frontend already knows the country it sends boundary_country directly and
// this is skipped; when it only has the device's lat/lon (the common case for
// a "nearby" search), this derives the country locally so the upstream call
// still gets a hard filter instead of running unfiltered worldwide.
//
// iso1A2Code takes [lon, lat] - the reverse of this codebase's lat/lon
// argument order - getting that backwards silently returns a wrong-but-
// plausible country instead of erroring, so keep the argument order explicit
// here rather than inlining this call at each adapter's call site.
function resolveBoundaryCountry(input) {
  if (input.boundary_country) return input.boundary_country;
  if (input.lat === undefined || input.lon === undefined) return undefined;
  return iso1A2Code([input.lon, input.lat]) || undefined;
}

module.exports = { resolveBoundaryCountry };
