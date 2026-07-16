function defaults(coupleId, openid) {
  return {
    coupleId,
    ownerOpenid: openid,
    taskDue: true,
    anniversary: true,
    rewardApproval: true,
    enabled: true
  };
}

function mergePreferences(current, source, coupleId, openid, updatedAt) {
  const saved = current && typeof current === "object" ? current : {};
  const input = source && typeof source === "object" ? source : {};
  const { _id, ...persisted } = saved;
  return {
    ...defaults(coupleId, openid),
    ...persisted,
    taskDue: input.taskDue !== false,
    anniversary: input.anniversary !== false,
    rewardApproval: input.rewardApproval !== false,
    enabled: input.enabled !== false,
    updatedAt
  };
}

function registerSubscription(current, templateIds, updatedAt) {
  const saved = current && typeof current === "object" ? current : {};
  const { _id, ...persisted } = saved;
  return {
    ...persisted,
    templateIds: Array.isArray(templateIds) ? templateIds.map(String).filter(Boolean).slice(0, 3) : [],
    consentedAt: updatedAt,
    updatedAt
  };
}

module.exports = { defaults, mergePreferences, registerSubscription };
