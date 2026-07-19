function success(data) {
  return { ok: true, data };
}

function failure(code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return { ok: false, error };
}

module.exports = { failure, success };
