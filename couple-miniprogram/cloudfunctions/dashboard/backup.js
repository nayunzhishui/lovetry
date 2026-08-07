const { normalizeRestoredRecord, normalizeRestoredPlan } = require("./restore-schema");

function backupError(code, userMessage) {
  const error = new Error(code);
  error.code = code;
  error.userMessage = userMessage;
  return error;
}

function sanitizeRestorableRecords(records) {
  return (Array.isArray(records) ? records : [])
    .slice(0, 500)
    .map((source) => {
      const normalized = normalizeRestoredRecord(source, "");
      return normalized && source && source._id ? { _id: source._id, ...normalized } : null;
    })
    .filter(Boolean);
}

function sanitizeRestorablePlans(plans, couple) {
  return (Array.isArray(plans) ? plans : [])
    .slice(0, 500)
    .map((source) => {
      const normalized = normalizeRestoredPlan(source, couple, "");
      return normalized && source && source._id ? { _id: source._id, ...normalized } : null;
    })
    .filter(Boolean);
}

function validateBackupEnvelope(backup, coupleId) {
  if (!backup || Number(backup.schemaVersion) !== 1 || !backup.couple || backup.couple._id !== coupleId) {
    throw backupError("INVALID_BACKUP", "备份格式不正确，或不属于当前情侣空间");
  }

  const truncated = backup.truncated || {};
  if (Object.values(truncated).some(Boolean)) {
    throw backupError("TRUNCATED_BACKUP", "该备份内容不完整，请重新导出完整备份");
  }

  return {
    records: sanitizeRestorableRecords(backup.records),
    plans: sanitizeRestorablePlans(backup.plans, backup.couple)
  };
}

module.exports = { validateBackupEnvelope };
