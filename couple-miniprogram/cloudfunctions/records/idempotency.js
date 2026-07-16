const crypto = require("crypto");

function recordIdForRequest(coupleId, openid, clientRequestId) {
  return crypto
    .createHash("sha256")
    .update(`${coupleId}:${openid}:${clientRequestId}`)
    .digest("hex")
    .slice(0, 32);
}

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

function comparableRecord(record) {
  const source = record || {};
  return {
    type: source.type || "",
    title: source.title || "",
    content: source.content || "",
    visibility: source.visibility || "",
    startAt: source.startAt || null,
    endAt: source.endAt || null,
    metrics: source.metrics || {},
    payload: source.payload || {},
    relatedPlanId: source.relatedPlanId || "",
    isTest: Boolean(source.isTest),
    ownerOpenid: source.ownerOpenid || source.creatorOpenid || ""
  };
}

function recordRequestFingerprint(record) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(comparableRecord(record))))
    .digest("hex");
}

function assertRecordRequestCompatible(existing, requested) {
  const existingFingerprint = existing && existing.requestFingerprint
    ? existing.requestFingerprint
    : recordRequestFingerprint(existing);
  if (existingFingerprint !== recordRequestFingerprint(requested)) {
    const error = new Error("IDEMPOTENCY_CONFLICT");
    error.code = "IDEMPOTENCY_CONFLICT";
    throw error;
  }
  return existing;
}

module.exports = {
  assertRecordRequestCompatible,
  recordIdForRequest,
  recordRequestFingerprint
};
