function ok(res, data = null, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

function created(res, data = null, message = 'Created') {
  return ok(res, data, message, 201);
}

function fail(res, message = 'Something went wrong', statusCode = 400, errors = null) {
  return res.status(statusCode).json({ success: false, message, errors });
}

module.exports = { ok, created, fail };
