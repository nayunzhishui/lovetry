const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const PLAN_TYPES = new Set(["task", "event", "menu", "trip", "anniversary"]);
const STATUSES = new Set(["todo", "doing", "done", "archived"]);
const ERROR_MESSAGES = {
  COUPLE_REQUIRED: "请先创建或加入情侣空间",
  INVALID_PLAN: "计划内容不完整",
  PLAN_NOT_FOUND: "计划不存在或已删除",
  NO_PERMISSION: "无权访问这个计划",
  VERSION_CONFLICT: "计划已在另一台设备更新，请刷新后重试",
  UNKNOWN_ACTION: "暂不支持这个操作"
};

function businessError(code, message) {
  const error = new Error(message || ERROR_MESSAGES[code] || "操作失败");
  error.code = code;
  return error;
}

function success(data) {
  return { ok: true, data, ...data };
}

function failure(error) {
  const code = error.code || error.message || "INTERNAL_ERROR";
  const known = Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code);
  return { ok: false, error: { code: known ? code : "INTERNAL_ERROR", message: known ? (error.message || ERROR_MESSAGES[code]) : "服务暂时不可用" } };
}

async function findMine(openid) {
  const result = await db
    .collection("couples")
    .where({ members: openid, status: _.neq("archived") })
    .limit(1)
    .get();
  return result.data[0] || null;
}

function text(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function date(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw businessError("INVALID_PLAN", "日期格式不正确");
  return parsed;
}

function normalize(input, couple, openid, current) {
  const plan = input || {};
  const type = plan.type || (current && current.type);
  const title = text(plan.title, 80);
  if (!PLAN_TYPES.has(type) || !title) throw businessError("INVALID_PLAN");
  const status = STATUSES.has(plan.status) ? plan.status : current?.status || "todo";
  const assigneeOpenids = Array.isArray(plan.assigneeOpenids)
    ? plan.assigneeOpenids.filter((member) => couple.members.includes(member)).slice(0, 2)
    : current?.assigneeOpenids || [];
  return {
    type,
    title,
    detail: text(plan.detail, 5000),
    status,
    assigneeOpenids,
    startAt: date(plan.startAt),
    endAt: date(plan.endAt),
    rewardPoints: Math.min(Math.max(Number(plan.rewardPoints) || 0, 0), 100000),
    payload: plan.payload && typeof plan.payload === "object" ? plan.payload : {},
    createdBy: current?.createdBy || openid
  };
}

async function getPlan(id, couple) {
  if (!id) throw businessError("PLAN_NOT_FOUND");
  try {
    const result = await db.collection("plans").doc(id).get();
    if (!result.data || result.data.coupleId !== couple._id || result.data.deletedAt) {
      throw businessError("PLAN_NOT_FOUND");
    }
    return result.data;
  } catch (error) {
    if (error.code) throw error;
    throw businessError("PLAN_NOT_FOUND");
  }
}

async function handle(event, openid) {
  const couple = await findMine(openid);
  if (!couple) throw businessError("COUPLE_REQUIRED");
  const action = event.action;

  if (action === "create") {
    const now = new Date();
    const data = {
      coupleId: couple._id,
      ...normalize(event.plan, couple, openid),
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    const result = await db.collection("plans").add({ data });
    return success({ plan: { _id: result._id, ...data } });
  }

  if (action === "list") {
    const limit = Math.min(Math.max(Number(event.limit) || 30, 1), 50);
    const offset = Math.max(Number(event.offset) || 0, 0);
    const where = { coupleId: couple._id, deletedAt: null };
    if (event.type && PLAN_TYPES.has(event.type)) where.type = event.type;
    if (event.status && STATUSES.has(event.status)) where.status = event.status;
    const result = await db
      .collection("plans")
      .where(where)
      .orderBy("createdAt", "desc")
      .skip(offset)
      .limit(limit + 1)
      .get();
    const plans = result.data.filter((plan) => !plan.deletedAt);
    return success({ plans: plans.slice(0, limit), page: { offset, limit, hasMore: result.data.length > limit } });
  }

  if (action === "get") {
    return success({ plan: await getPlan(event.planId, couple) });
  }

  if (action === "update") {
    if (!event.planId) throw businessError("PLAN_NOT_FOUND");
    const updated = await db.runTransaction(async (transaction) => {
      let current;
      try {
        current = (await transaction.collection("plans").doc(event.planId).get()).data;
      } catch (error) {
        throw businessError("PLAN_NOT_FOUND");
      }
      if (!current || current.coupleId !== couple._id || current.deletedAt) throw businessError("PLAN_NOT_FOUND");
      if (event.version && Number(event.version) !== Number(current.version || 1)) {
        throw businessError("VERSION_CONFLICT");
      }
      const next = normalize(event.plan, couple, openid, current);
      const updatedAt = new Date();
      const version = Number(current.version || 1) + 1;
      await transaction.collection("plans").doc(current._id).update({ data: { ...next, updatedAt, version } });
      return { ...current, ...next, updatedAt, version };
    });
    return success({ plan: updated });
  }

  if (action === "setStatus") {
    const current = await getPlan(event.planId, couple);
    if (!STATUSES.has(event.status)) throw businessError("INVALID_PLAN", "状态不正确");
    const updatedAt = new Date();
    const completedAt = event.status === "done" ? updatedAt : null;
    await db.collection("plans").doc(current._id).update({
      data: { status: event.status, completedAt, updatedAt, version: _.inc(1) }
    });
    return success({ plan: { ...current, status: event.status, completedAt, updatedAt } });
  }

  if (action === "toggleChecklist") {
    const current = await getPlan(event.planId, couple);
    const checklist = current.payload && Array.isArray(current.payload.checklist)
      ? current.payload.checklist.map((item) => ({ title: text(item.title, 80), done: Boolean(item.done) }))
      : [];
    const index = Number(event.index);
    if (!Number.isInteger(index) || index < 0 || index >= checklist.length) {
      throw businessError("INVALID_PLAN", "清单项不存在");
    }
    checklist[index].done = !checklist[index].done;
    const updatedAt = new Date();
    const payload = { ...(current.payload || {}), checklist };
    await db.collection("plans").doc(current._id).update({
      data: { payload, updatedAt, version: _.inc(1) }
    });
    return success({ plan: { ...current, payload, updatedAt, version: Number(current.version || 1) + 1 } });
  }

  if (action === "delete") {
    const current = await getPlan(event.planId, couple);
    const deletedAt = new Date();
    await db.collection("plans").doc(current._id).update({
      data: { deletedAt, updatedAt: deletedAt, version: _.inc(1) }
    });
    return success({ planId: current._id, deletedAt });
  }

  if (action === "randomMenu") {
    const result = await db
      .collection("plans")
      .where({ coupleId: couple._id, type: "menu", status: _.neq("archived"), deletedAt: null })
      .limit(100)
      .get();
    const excluded = new Set(Array.isArray(event.excludeIds) ? event.excludeIds : []);
    const candidates = result.data.filter((plan) => !plan.deletedAt && !excluded.has(plan._id));
    if (candidates.length === 0) return success({ plan: null });
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    return success({ plan: picked });
  }

  throw businessError("UNKNOWN_ACTION");
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  try {
    return await handle(event, OPENID);
  } catch (error) {
    console.error("plans function failed", { action: event.action, code: error.code || error.message });
    return failure(error);
  }
};
