const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const { recordIdForRequest } = require("./idempotency");
const { toggleReaction, validateReactionRequest } = require("./reactions");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const RECORD_TYPES = new Set([
  "moment",
  "mood",
  "conflict",
  "outing",
  "sleep",
  "period",
  "game",
  "pomodoro"
]);
const PRIVATE_BY_DEFAULT = new Set(["mood", "conflict", "sleep", "period", "pomodoro"]);
const ERROR_MESSAGES = {
  COUPLE_REQUIRED: "请先创建或加入情侣空间",
  INVALID_RECORD: "记录内容不完整",
  RECORD_NOT_FOUND: "记录不存在或已删除",
  NO_PERMISSION: "无权查看或修改这条记录",
  VERSION_CONFLICT: "记录已在另一台设备更新，请刷新后重试",
  INVALID_REACTION: "请选择有效回应",
  IDEMPOTENCY_KEY_REQUIRED: "请求标识缺失，请重试",
  IDEMPOTENCY_CONFLICT: "重复请求内容不一致，请刷新后重试",
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
  return {
    ok: false,
    error: {
      code: known ? code : "INTERNAL_ERROR",
      message: known ? (error.message || ERROR_MESSAGES[code]) : "服务暂时不可用"
    }
  };
}

async function findMine(openid) {
  const result = await db
    .collection("couples")
    .where({ members: openid, status: _.neq("archived") })
    .limit(1)
    .get();
  return result.data[0] || null;
}

function trimText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw businessError("INVALID_RECORD", "日期格式不正确");
  return parsed;
}

function normalizeVisibility(type, visibility) {
  if (visibility === "private" || visibility === "couple") return visibility;
  return PRIVATE_BY_DEFAULT.has(type) ? "private" : "couple";
}

function normalizeRecord(input, openid, existing) {
  const record = input || {};
  const type = record.type || (existing && existing.type);
  if (!RECORD_TYPES.has(type)) throw businessError("INVALID_RECORD", "不支持这种记录类型");
  const title = trimText(record.title, 80);
  const content = trimText(record.content, 5000);
  if (!title && !content) throw businessError("INVALID_RECORD");

  return {
    type,
    title,
    content,
    visibility: normalizeVisibility(type, record.visibility),
    startAt: parseDate(record.startAt),
    endAt: parseDate(record.endAt),
    metrics: record.metrics && typeof record.metrics === "object" ? record.metrics : {},
    payload: record.payload && typeof record.payload === "object" ? record.payload : {},
    relatedPlanId: trimText(record.relatedPlanId, 64),
    isTest: Boolean(record.isTest),
    ownerOpenid: existing ? existing.ownerOpenid || existing.creatorOpenid : openid
  };
}

function isDeleted(record) {
  return Boolean(record.deletedAt);
}

function canRead(record, openid) {
  if (isDeleted(record)) return false;
  if (!record.visibility) return true;
  return record.visibility === "couple" || record.ownerOpenid === openid || record.creatorOpenid === openid;
}

function canEdit(record, openid) {
  return record.ownerOpenid === openid || record.creatorOpenid === openid;
}

async function getRecord(recordId) {
  if (!recordId) throw businessError("RECORD_NOT_FOUND");
  try {
    const result = await db.collection("records").doc(recordId).get();
    return result.data;
  } catch (error) {
    throw businessError("RECORD_NOT_FOUND");
  }
}

async function assertAccessibleRecord(recordId, couple, openid, edit = false) {
  const record = await getRecord(recordId);
  if (!record || record.coupleId !== couple._id || isDeleted(record)) {
    throw businessError("RECORD_NOT_FOUND");
  }
  if (edit ? !canEdit(record, openid) : !canRead(record, openid)) {
    throw businessError("NO_PERMISSION");
  }
  return record;
}

async function handle(event, openid) {
  const action = event.action;
  const couple = await findMine(openid);
  if (!couple) throw businessError("COUPLE_REQUIRED");

  if (action === "create") {
    const now = new Date();
    const normalized = normalizeRecord(event.record, openid);
    const data = {
      coupleId: couple._id,
      ...normalized,
      creatorOpenid: openid,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    const clientRequestId = trimText(event.record && event.record.clientRequestId, 120);
    if (clientRequestId) {
      const recordId = recordIdForRequest(couple._id, openid, clientRequestId);
      try {
        const existing = (await db.collection("records").doc(recordId).get()).data;
        if (existing && existing.coupleId === couple._id && canRead(existing, openid)) return success({ record: existing, duplicate: true });
      } catch (error) {
        // The deterministic record does not exist yet.
      }
      data.clientRequestId = clientRequestId;
      await db.collection("records").doc(recordId).set({ data });
      return success({ record: { _id: recordId, ...data } });
    }
    const addResult = await db.collection("records").add({ data });
    return success({ record: { _id: addResult._id, ...data } });
  }

  if (action === "list") {
    const limit = Math.min(Math.max(Number(event.limit) || 30, 1), 50);
    const offset = Math.max(Number(event.offset) || 0, 0);
    const filters = [
      { coupleId: couple._id },
      _.or(
        { visibility: "couple" },
        { ownerOpenid: openid },
        { creatorOpenid: openid },
        { visibility: _.exists(false) }
      ),
      _.or({ deletedAt: null }, { deletedAt: _.exists(false) })
    ];
    if (event.type && RECORD_TYPES.has(event.type)) filters.push({ type: event.type });
    const result = await db
      .collection("records")
      .where(_.and(...filters))
      .orderBy("createdAt", "desc")
      .skip(offset)
      .limit(limit + 1)
      .get();
    const visible = result.data.filter((record) => canRead(record, openid));
    return success({
      records: visible.slice(0, limit),
      page: { offset, limit, hasMore: visible.length > limit }
    });
  }

  if (action === "feed") {
    const result = await db.collection("records")
      .where({ coupleId: couple._id, visibility: "couple", type: _.in(["moment", "mood", "outing"]), deletedAt: null })
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    return success({ records: result.data.filter((record) => canRead(record, openid)) });
  }

  if (action === "react") {
    if (!String(event.idempotencyKey || "").trim()) throw businessError("IDEMPOTENCY_KEY_REQUIRED");
    const requestId = crypto.createHash("sha256").update(`${couple._id}:${openid}:${event.idempotencyKey}`).digest("hex").slice(0, 32);
    const updated = await db.runTransaction(async (transaction) => {
      try {
        const request = (await transaction.collection("record_reaction_requests").doc(requestId).get()).data;
        if (request) return validateReactionRequest(request, event.recordId, event.reaction);
      } catch (error) {
        if (error.code === "IDEMPOTENCY_CONFLICT") throw error;
      }
      let record;
      try { record = (await transaction.collection("records").doc(event.recordId).get()).data; } catch (error) { throw businessError("RECORD_NOT_FOUND"); }
      if (!record || record.coupleId !== couple._id || record.deletedAt) throw businessError("RECORD_NOT_FOUND");
      if (record.visibility !== "couple" || !["moment", "mood", "outing"].includes(record.type)) throw businessError("NO_PERMISSION");
      const payload = { ...(record.payload || {}), reactionsByOpenid: toggleReaction(record.payload && record.payload.reactionsByOpenid, openid, event.reaction) };
      const updatedAt = new Date();
      const next = { ...record, payload, updatedAt, version: Number(record.version || 1) + 1 };
      await transaction.collection("records").doc(record._id).update({ data: { payload, updatedAt, version: next.version } });
      await transaction.collection("record_reaction_requests").doc(requestId).set({ data: {
        coupleId: couple._id, ownerOpenid: openid, recordId: record._id, reaction: event.reaction,
        idempotencyKey: String(event.idempotencyKey).slice(0, 160), record: next, createdAt: updatedAt
      } });
      return next;
    });
    return success({ record: updated });
  }

  if (action === "get") {
    const record = await assertAccessibleRecord(event.recordId, couple, openid);
    return success({ record });
  }

  if (action === "update") {
    if (!event.recordId) throw businessError("RECORD_NOT_FOUND");
    const updated = await db.runTransaction(async (transaction) => {
      let latest;
      try {
        latest = (await transaction.collection("records").doc(event.recordId).get()).data;
      } catch (error) {
        throw businessError("RECORD_NOT_FOUND");
      }
      if (!latest || latest.coupleId !== couple._id || isDeleted(latest)) throw businessError("RECORD_NOT_FOUND");
      if (!canEdit(latest, openid)) throw businessError("NO_PERMISSION");
      if (event.version && Number(event.version) !== Number(latest.version || 1)) {
        throw businessError("VERSION_CONFLICT");
      }
      const normalized = normalizeRecord(event.record, openid, latest);
      const nextVersion = Number(latest.version || 1) + 1;
      const updatedAt = new Date();
      await transaction.collection("records").doc(latest._id).update({
        data: { ...normalized, version: nextVersion, updatedAt }
      });
      return { ...latest, ...normalized, version: nextVersion, updatedAt };
    });
    return success({ record: updated });
  }

  if (action === "delete") {
    const current = await assertAccessibleRecord(event.recordId, couple, openid, true);
    const deletedAt = new Date();
    await db.collection("records").doc(current._id).update({
      data: { deletedAt, updatedAt: deletedAt, version: _.inc(1) }
    });
    return success({ recordId: current._id, deletedAt });
  }

  if (action === "cleanupTestData") {
    const result = await db
      .collection("records")
      .where({ coupleId: couple._id, ownerOpenid: openid, isTest: true })
      .limit(50)
      .get();
    await Promise.all(
      result.data.map((record) =>
        db.collection("records").doc(record._id).update({
          data: { deletedAt: new Date(), updatedAt: new Date(), version: _.inc(1) }
        })
      )
    );
    return success({ deletedCount: result.data.length });
  }

  if (action === "stats") {
    const type = event.type;
    if (!RECORD_TYPES.has(type)) throw businessError("INVALID_RECORD", "请选择正确的记录类型");
    const result = await db
      .collection("records")
      .where(_.and(
        { coupleId: couple._id, type },
        _.or(
          { visibility: "couple" },
          { ownerOpenid: openid },
          { creatorOpenid: openid },
          { visibility: _.exists(false) }
        ),
        _.or({ deletedAt: null }, { deletedAt: _.exists(false) })
      ))
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const now = Date.now();
    const visible = result.data.filter((record) => canRead(record, openid));
    const withinDays = (days) => visible.filter((record) => {
      const timestamp = new Date(record.startAt || record.createdAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= now - days * 24 * 60 * 60 * 1000;
    });
    const previous7Days = visible.filter((record) => {
      const timestamp = new Date(record.startAt || record.createdAt).getTime();
      return Number.isFinite(timestamp) && timestamp < now - 7 * 86400000 && timestamp >= now - 14 * 86400000;
    });
    const durationSummary = (records) => {
      const durations = records
        .map((record) => Number(record.metrics && record.metrics.durationMinutes))
        .filter((value) => Number.isFinite(value) && value > 0);
      return {
        count: records.length,
        totalMinutes: durations.reduce((sum, value) => sum + value, 0),
        averageMinutes: durations.length
          ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
          : 0
      };
    };
    return success({ stats: { type, last7Days: durationSummary(withinDays(7)), previous7Days: durationSummary(previous7Days), last30Days: durationSummary(withinDays(30)) } });
  }

  throw businessError("UNKNOWN_ACTION");
}

exports.main = async (event = {}) => {
  const startedAt = Date.now();
  const { OPENID } = cloud.getWXContext();
  try {
    const result = await handle(event, OPENID);
    console.info("records function completed", { traceId: event._traceId || "", action: event.action || "", code: "OK", durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    console.error("records function failed", {
      traceId: event._traceId || "",
      action: event.action,
      code: error.code || error.message,
      durationMs: Date.now() - startedAt
    });
    return failure(error);
  }
};
