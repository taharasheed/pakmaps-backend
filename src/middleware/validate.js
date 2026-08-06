function validate(schema) {
  return function validateMiddleware(req, res, next) {
    const result = schema.parse({ body: req.body, query: req.query, params: req.params });
    if (result.body) req.body = result.body;
    if (result.query) req.query = result.query;
    if (result.params) req.params = result.params;
    next();
  };
}

module.exports = validate;
