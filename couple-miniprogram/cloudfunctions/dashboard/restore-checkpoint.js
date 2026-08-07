const crypto = require("crypto");

function restoreBatchId(coupleId, ownerId, recovery) {
  const fingerprint = JSON.stringify({
    coupleId: String(coupleId || ""),
    ownerId: String(ownerId || ""),
    records: (recovery.records || []).map((item) => item._id),
    plans: (recovery.plans || []).map((item) => item._id)
  });
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

module.exports = { batchEnd, normalizeRestoreJob, restoreBatchId };
