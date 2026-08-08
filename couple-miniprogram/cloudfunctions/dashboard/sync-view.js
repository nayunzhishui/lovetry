function canReadRecord(record, openid) {
  if (record.deletedAt) return false;
  if (!record.visibility) return true;
  return record.visibility === "couple" || record.ownerOpenid === openid || record.creatorOpenid === openid;
}

// sync 下发视图：已删除记录降级为"瘦墓碑"（仅 _id/deletedAt/updatedAt），
// 保证删除事件能同步到伴侣设备，同时不泄露已删内容；未删除记录按可见性过滤。
function projectSyncRecords(records, openid) {
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      if (record.deletedAt) {
        return { _id: record._id, deletedAt: record.deletedAt, updatedAt: record.updatedAt };
      }
      return canReadRecord(record, openid) ? record : null;
    })
    .filter(Boolean);
}

module.exports = { canReadRecord, projectSyncRecords };
