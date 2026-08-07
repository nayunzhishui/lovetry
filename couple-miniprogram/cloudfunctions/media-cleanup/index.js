const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function cleanupBatch(limit = 50) {
  const size = Math.min(Math.max(Number(limit) || 50, 1), 50);
  const result = await db.collection("media_assets").where({ pendingDeletion: true }).limit(size).get();
  let deleted = 0;
  let failed = 0;

  for (const asset of result.data || []) {
    if (!asset || !asset._id || !asset.fileID || !asset.deletedAt) continue;
    try {
      await cloud.deleteFile({ fileList: [asset.fileID] });
      const now = new Date();
      await db.collection("media_assets").doc(asset._id).update({ data: {
        pendingDeletion: false,
        fileDeletedAt: now,
        cleanupUpdatedAt: now
      } });
      deleted += 1;
    } catch (error) {
      failed += 1;
      await db.collection("media_assets").doc(asset._id).update({ data: {
        cleanupAttempts: Number(asset.cleanupAttempts || 0) + 1,
        cleanupUpdatedAt: new Date(),
        cleanupErrorCode: String(error && (error.errCode || error.code) || "DELETE_FAILED").slice(0, 80)
      } });
    }
  }

  return { ok: true, data: { scanned: (result.data || []).length, deleted, failed } };
}

exports.main = async () => cleanupBatch(50);
exports.cleanupBatch = cleanupBatch;
