const { VISIBILITIES } = require("./constants");

function isCoupleMember(couple, openid) {
  return Boolean(
    openid &&
      couple &&
      Array.isArray(couple.members) &&
      couple.members.includes(openid)
  );
}

function evaluateRecordAccess({ couple, record, openid } = {}) {
  const isMember = isCoupleMember(couple, openid);
  if (!isMember || !record) {
    return { isMember, canRead: false, canWrite: false };
  }

  const ownerOpenid = record.ownerOpenid || record.creatorOpenid;
  const isOwner = ownerOpenid === openid;
  const isPrivate = record.visibility === VISIBILITIES.PRIVATE;

  return {
    isMember: true,
    canRead: !isPrivate || isOwner,
    canWrite: isOwner
  };
}

module.exports = { evaluateRecordAccess, isCoupleMember };
