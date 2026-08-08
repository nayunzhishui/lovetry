process.env.TZ = "Asia/Shanghai";
const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const {
  assertRecordRequestCompatible,
  recordIdForRequest,
  recordRequestFingerprint
} = require("./idempotency");
const { preservePartnerReactions, toggleReaction, validateReactionRequest } = require("./reactions");
const { findMineViaMembership } = require("./membership");
const { exceedsFlexibleFieldLimit } = require("./payload-guard");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const { RECORD_TYPES, normalizeVisibility } = require("./visibility");
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
  // 快路径：memberships 哈希主键 O(1) 命中；miss 或数据不一致时模块内部回退 couples 条件查询
  return findMineViaMembership(db, openid);
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

function normalizeRecord(input, openid, existing) {
  const record = input || {};
  const type = record.type || (existing && existing.type);
  if (!RECORD_TYPES.has(type)) throw businessError("INVALID_RECORD", "不支持这种记录类型");
  const title = trimText(record.title, 80);
  const content = trimText(record.content, 5000);
  if (!title && !content) throw businessError("INVALID_RECORD");
  const metrics = record.metrics && typeof record.metrics === "object" ? record.metrics : {};
  const payload = record.payload && typeof record.payload === "object" ? record.payload : {};
  // payload/metrics 是自由结构，必须限制 JSON 体积，防止单文档膨胀
  if (exceedsFlexibleFieldLimit(metrics) || exceedsFlexibleFieldLimit(payload)) {
    throw businessError("INVALID_RECORD", "附加内容过大，请精简后重试");
  }

  return {
    type,
    title,
    content,
    visibility: normalizeVisibility(type, record.visibility, existing && existing.visibility),
    startAt: parseDate(record.startAt),
    endAt: parseDate(record.endAt),
    metrics,
    payload,
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

const REACTION_LABELS = { seen: "看见了", hug: "抱一下", cheer: "一起加油" };

// 轻回应回执：新增回应且记录 owner 不是回应者本人时，给 owner 写一条站内提醒。
// 提醒写入失败不能影响 react 主流程：吞掉并 console.error。
async function notifyRecordOwnerOfReaction(couple, reactorOpenid, outcome, reaction) {
  try {
    if (!outcome || outcome.replay || !outcome.added || !outcome.record) return;
    const record = outcome.record;
    const recipientOpenid = record.ownerOpenid || record.creatorOpenid || "";
    if (!recipientOpenid || recipientOpenid === reactorOpenid) return;
    const now = new Date();
    const scheduledDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    await db.collection("notifications").add({ data: {
      coupleId: couple._id,
      recipientOpenid,
      type: "reaction",
      sourceId: record._id,
      title: "TA 对你的记录有了回应",
      body: `「${record.title || "你的记录"}」· ${REACTION_LABELS[reaction] || "回应"}`,
      scheduledDate,
      daysRemaining: 0,
      readAt: null,
      createdAt: now,
      updatedAt: now
    } });
  } catch (error) {
    console.error("reaction notification write failed", { code: error.code || error.message });
  }
}

async function handle(event, openid) {
  const action = event.action;
  const couple = await findMine(openid);
  if (!couple) throw businessError("COUPLE_REQUIRED");

  if (action === "create") {
    const now = new Date();
    const normalized = normalizeRecord(event.record, openid);
    // 轻回应只能由 react 动作写入，创建时剥离输入里伪造的 reactionsByOpenid
    normalized.payload = preservePartnerReactions(normalized.payload, null);
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
      data.clientRequestId = clientRequestId;
      data.requestFingerprint = recordRequestFingerprint(normalized);
      const result = await db.runTransaction(async (transaction) => {
        let existing = null;
        try {
          existing = (await transaction.collection("records").doc(recordId).get()).data;
        } catch (error) {
          // The deterministic record does not exist yet.
        }
        if (existing) {
          if (existing.coupleId !== couple._id || !canRead(existing, openid)) {
            throw businessError("IDEMPOTENCY_CONFLICT");
          }
          assertRecordRequestCompatible(existing, normalized);
          return { record: existing, duplicate: true };
        }
        await transaction.collection("records").doc(recordId).set({ data });
        return { record: { _id: recordId, ...data }, duplicate: false };
      });
      return success(result);
    }
    const addResult = await db.collection("records").add({ data });
    return success({ record: { _id: addResult._id, ...data } });
  }

  if (action === "list") {
    const limit = Math.min(Math.max(Number(event.limit) || 30, 1), 50);
    const offset = Math.max(Number(event.offset) || 0, 0);
    const visibilityFilter = event.ownerOnly
      ? _.or({ ownerOpenid: openid }, { creatorOpenid: openid })
      : _.or(
        { visibility: "couple" },
        { ownerOpenid: openid },
        { creatorOpenid: openid },
        { visibility: _.exists(false) }
      );
    const filters = [
      { coupleId: couple._id },
      visibilityFilter,
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
    // 不传 offset/limit 时保持旧行为（首屏最多 50 条），传入 offset 后支持翻页
    const limit = Math.min(Math.max(Number(event.limit) || 50, 1), 50);
    const offset = Math.max(Number(event.offset) || 0, 0);
    const result = await db.collection("records")
      .where({ coupleId: couple._id, visibility: "couple", type: _.in(["moment", "mood", "outing"]), deletedAt: null })
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

  if (action === "react") {
    if (!String(event.idempotencyKey || "").trim()) throw businessError("IDEMPOTENCY_KEY_REQUIRED");
    const requestId = crypto.createHash("sha256").update(`${couple._id}:${openid}:${event.idempotencyKey}`).digest("hex").slice(0, 32);
    const outcome = await db.runTransaction(async (transaction) => {
      try {
        const request = (await transaction.collection("record_reaction_requests").doc(requestId).get()).data;
        // 幂等重放：直接返回上次结果，不再重复提醒
        if (request) return { record: validateReactionRequest(request, event.recordId, event.reaction), replay: true, added: false };
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
      // toggleReaction 的结果里仍带着本人条目 = 本次是新增/更换回应；条目消失 = 取消（不提醒）
      return { record: next, replay: false, added: Boolean(payload.reactionsByOpenid[openid]) };
    });
    await notifyRecordOwnerOfReaction(couple, openid, outcome, event.reaction);
    return success({ record: outcome.record });
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
      // 伴侣的轻回应存放在 payload.reactionsByOpenid：owner 编辑记录不能覆盖/清空它
      normalized.payload = preservePartnerReactions(normalized.payload, latest.payload);
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
