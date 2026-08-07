function validate(schema) {
  return function validateMiddleware(req, res, next) {
    const result = schema.parse({ body: req.body, query: req.query, params: req.params });
    if (result.body) req.body = result.body;
    // req.query is a getter-only accessor on Express 5's request prototype -
    // a plain `req.query = ...` assignment is silently swallowed (no error,
    // no effect), so the zod-coerced/defaulted query is redefined as an own
    // property to actually shadow it.
    if (result.query) Object.defineProperty(req, 'query', { value: result.query, writable: true, enumerable: true, configurable: true });
    if (result.params) req.params = result.params;
    next();
  };
}

module.exports = validate;
