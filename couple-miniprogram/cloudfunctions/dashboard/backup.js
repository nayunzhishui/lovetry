function backupError(code, userMessage) {
  const error = new Error(code);
  error.code = code;
  error.userMessage = userMessage;
  return error;
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
    records: (Array.isArray(backup.records) ? backup.records : []).slice(0, 500),
    plans: (Array.isArray(backup.plans) ? backup.plans : []).slice(0, 500)
  };
}

module.exports = { validateBackupEnvelope };
