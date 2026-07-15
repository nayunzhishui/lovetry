function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function checksum(value) {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function createBackupManifest(payload) {
  return { schemaVersion: 2, checksum: checksum(payload), payload };
}

function verifyBackupManifest(manifest) {
  return Boolean(manifest && Number(manifest.schemaVersion) === 2 && manifest.checksum === checksum(manifest.payload));
}

module.exports = { createBackupManifest, verifyBackupManifest };
