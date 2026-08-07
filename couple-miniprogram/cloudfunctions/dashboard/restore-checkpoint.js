const crypto = require("crypto");

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function restoreBatchId(coupleId, ownerId, recovery) {
  const fingerprint = JSON.stringify(stableValue({
    coupleId: String(coupleId || ""),
    ownerId: String(ownerId || ""),
    records: recovery.records || [],
    plans: recovery.plans || []
  }));
  return crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 32);
}

function normalizeRestoreJob(job, recovery) {
  const source = job && typeof job === "object" ? job : {};
  const counts = source.counts && typeof source.counts === "object" ? source.counts : {};
  const recordIndex = Math.min(Math.max(Number(source.recordIndex) || 0, 0), recovery.records.length);
  const planIndex = Math.min(Math.max(Number(source.planIndex) || 0, 0), recovery.plans.length);
  const hasMore = recordIndex < recovery.records.length || planIndex < recovery.plans.length;
  return {
    recordIndex,
    planIndex,
    counts: {
      records: Math.max(Number(counts.records) || 0, 0),
      plans: Math.max(Number(counts.plans) || 0, 0),
      skipped: Math.max(Number(counts.skipped) || 0, 0)
    },
    status: hasMore ? "running" : "completed",
    hasMore
  };
}

function batchEnd(index, total, batchSize = 25) {
  return Math.min(total, index + Math.min(Math.max(Number(batchSize) || 25, 1), 50));
}

module.exports = { batchEnd, normalizeRestoreJob, restoreBatchId, stableValue };
