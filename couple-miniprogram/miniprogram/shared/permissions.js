const { RECORD_TYPES, VISIBILITIES } = require("./constants");

const PRIVATE_BY_DEFAULT = new Set([
  RECORD_TYPES.MOOD,
  RECORD_TYPES.CONFLICT,
  RECORD_TYPES.SLEEP,
  RECORD_TYPES.PERIOD,
  RECORD_TYPES.INTIMACY,
  RECORD_TYPES.POMODORO
]);

function isCoupleMember(couple, openid) {
  return Boolean(
    openid &&
      couple &&
      Array.isArray(couple.members) &&
      couple.members.includes(openid)
  );
}

function isRecordPrivate(record) {
  if (!record) return true;
  if (record.visibility === VISIBILITIES.PRIVATE) return true;
  if (record.visibility === VISIBILITIES.COUPLE) return false;
  return PRIVATE_BY_DEFAULT.has(record.type);
}

function evaluateRecordAccess({ couple, record, openid } = {}) {
  const isMember = isCoupleMember(couple, openid);
  if (!isMember || !record) {
    return { isMember, canRead: false, canWrite: false };
  }

  const ownerOpenid = record.ownerOpenid || record.creatorOpenid;
  const isOwner = ownerOpenid === openid;
  const isPrivate = isRecordPrivate(record);

  return {
    isMember: true,
    canRead: !isPrivate || isOwner,
    canWrite: isOwner
  };
}

module.exports = { evaluateRecordAccess, isCoupleMember, isRecordPrivate };
