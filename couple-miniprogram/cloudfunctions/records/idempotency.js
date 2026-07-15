const crypto = require("crypto");

function recordIdForRequest(coupleId, openid, clientRequestId) {
  return crypto
    .createHash("sha256")
    .update(`${coupleId}:${openid}:${clientRequestId}`)
    .digest("hex")
    .slice(0, 32);
}

module.exports = { recordIdForRequest };
