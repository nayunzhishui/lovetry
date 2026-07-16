function versionOf(plan) {
  return Number(plan && plan.version || 1);
}

function assertVersion(plan, expectedVersion) {
  if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== "" &&
      Number(expectedVersion) !== versionOf(plan)) {
    const error = new Error("计划已在另一台设备更新，请刷新后重试");
    error.code = "VERSION_CONFLICT";
    throw error;
  }
}

function setStatus(plan, status, updatedAt) {
  return {
    ...plan,
    status,
    completedAt: status === "done" ? updatedAt : null,
    updatedAt,
    version: versionOf(plan) + 1
  };
}

function toggleChecklist(plan, index, updatedAt) {
  const source = plan && plan.payload && Array.isArray(plan.payload.checklist)
    ? plan.payload.checklist
    : [];
  if (!Number.isInteger(index) || index < 0 || index >= source.length) {
    const error = new Error("清单项不存在");
    error.code = "INVALID_PLAN";
    throw error;
  }
  const checklist = source.map((item, itemIndex) => ({
    title: String(item && item.title || "").trim().slice(0, 80),
    done: itemIndex === index ? !Boolean(item.done) : Boolean(item.done)
  }));
  return {
    ...plan,
    payload: { ...(plan.payload || {}), checklist },
    updatedAt,
    version: versionOf(plan) + 1
  };
}

function markDeleted(plan, deletedAt) {
  return {
    ...plan,
    deletedAt,
    updatedAt: deletedAt,
    version: versionOf(plan) + 1
  };
}

module.exports = { assertVersion, markDeleted, setStatus, toggleChecklist, versionOf };
