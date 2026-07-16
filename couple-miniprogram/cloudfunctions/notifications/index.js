const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const { buildReminderCandidates } = require("./schedule");
const {
  defaults,
  mergePreferences,
  registerSubscription
} = require("./preferences");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const ERROR_MESSAGES = {
  COUPLE_REQUIRED: "请先创建或加入情侣空间",
  INVALID_PREFERENCES: "提醒设置不正确",
  NOTIFICATION_NOT_FOUND: "提醒不存在或无权访问",
  UNKNOWN_ACTION: "暂不支持这个操作"
};

function businessError(code) {
  const error = new Error(ERROR_MESSAGES[code] || "操作失败");
  error.code = code;
  return error;
}

function success(data) { return { ok: true, data, ...data }; }
function failure(error) {
  const code = ERROR_MESSAGES[error.code] ? error.code : "INTERNAL_ERROR";
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] || "服务暂时不可用" } };
}

async function findMine(openid) {
  const result = await db.collection("couples").where({ members: openid, status: _.neq("archived") }).limit(1).get();
  return result.data[0] || null;
}

function preferenceId(coupleId, openid) {
  return `${coupleId}_${openid}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function getPreferences(couple, openid) {
  const id = preferenceId(couple._id, openid);
  try {
    return { _id: id, ...defaults(couple._id, openid), ...(await db.collection("notification_preferences").doc(id).get()).data };
  } catch (error) {
    return { _id: id, ...defaults(couple._id, openid) };
  }
}

function notificationId(coupleId, openid, reminder) {
  return crypto.createHash("sha256").update(`${coupleId}:${openid}:${reminder.type}:${reminder.sourceId}:${reminder.scheduledDate}`).digest("hex").slice(0, 32);
}

async function handle(event, openid) {
  const couple = await findMine(openid);
  if (!couple) throw businessError("COUPLE_REQUIRED");

  if (event.action === "getPreferences") return success({ preferences: await getPreferences(couple, openid) });

  if (event.action === "updatePreferences") {
    const source = event.preferences;
    if (!source || typeof source !== "object") throw businessError("INVALID_PREFERENCES");
    const id = preferenceId(couple._id, openid);
    const data = await db.runTransaction(async (transaction) => {
      let current = { _id: id, ...defaults(couple._id, openid) };
      try {
        current = { ...current, ...(await transaction.collection("notification_preferences").doc(id).get()).data };
      } catch (error) {
        // First preference write.
      }
      const next = mergePreferences(current, source, couple._id, openid, new Date());
      await transaction.collection("notification_preferences").doc(id).set({ data: next });
      return next;
    });
    return success({ preferences: { _id: id, ...data } });
  }

  if (event.action === "registerSubscription") {
    const id = preferenceId(couple._id, openid);
    const templateIds = Array.isArray(event.templateIds) ? event.templateIds.map(String).filter(Boolean).slice(0, 3) : [];
    await db.runTransaction(async (transaction) => {
      let current = { _id: id, ...defaults(couple._id, openid) };
      try {
        current = { ...current, ...(await transaction.collection("notification_preferences").doc(id).get()).data };
      } catch (error) {
        // First preference write.
      }
      const data = registerSubscription(current, templateIds, new Date());
      await transaction.collection("notification_preferences").doc(id).set({ data });
    });
    return success({ registered: templateIds.length });
  }

  if (event.action === "preview" || event.action === "materializeMine") {
    const preferences = await getPreferences(couple, openid);
    const [planResult, inventoryResult] = await Promise.all([
      db.collection("plans").where({ coupleId: couple._id, deletedAt: null }).limit(100).get(),
      db.collection("reward_inventory").where({ coupleId: couple._id, status: "pending" }).limit(100).get()
    ]);
    const partnerInventory = inventoryResult.data.filter((item) => item.ownerOpenid !== openid);
    const reminders = preferences.enabled ? buildReminderCandidates(planResult.data, new Date(), partnerInventory).filter((item) =>
      (item.type === "task" && preferences.taskDue) ||
      (item.type === "anniversary" && preferences.anniversary) ||
      (item.type === "rewardApproval" && preferences.rewardApproval)
    ) : [];
    if (event.action === "materializeMine") {
      const now = new Date();
      await Promise.all(reminders.map(async (reminder) => {
        const reference = db.collection("notifications").doc(notificationId(couple._id, openid, reminder));
        try {
          const existing = (await reference.get()).data;
          if (existing) return;
        } catch (error) { /* deterministic id makes create safe to retry */ }
        await reference.set({ data: {
          coupleId: couple._id, recipientOpenid: openid, ...reminder, readAt: null, createdAt: now, updatedAt: now
        } });
      }));
    }
    return success({ reminders });
  }

  if (event.action === "list") {
    const result = await db.collection("notifications").where({ coupleId: couple._id, recipientOpenid: openid }).orderBy("createdAt", "desc").limit(50).get();
    return success({ notifications: result.data });
  }

  if (event.action === "markRead") {
    let current;
    try { current = (await db.collection("notifications").doc(event.notificationId).get()).data; } catch (error) { throw businessError("NOTIFICATION_NOT_FOUND"); }
    if (!current || current.coupleId !== couple._id || current.recipientOpenid !== openid) throw businessError("NOTIFICATION_NOT_FOUND");
    const readAt = new Date();
    await db.collection("notifications").doc(current._id).update({ data: { readAt, updatedAt: readAt } });
    return success({ notificationId: current._id, readAt });
  }

  throw businessError("UNKNOWN_ACTION");
}

exports.main = async (event = {}) => {
  const startedAt = Date.now();
  const { OPENID } = cloud.getWXContext();
  try {
    const result = await handle(event, OPENID);
    console.info("notifications function completed", { traceId: event._traceId || "", action: event.action || "", code: "OK", durationMs: Date.now() - startedAt });
    return result;
  }
  catch (error) {
    console.error("notifications function failed", { traceId: event._traceId || "", action: event.action, code: error.code || error.message, durationMs: Date.now() - startedAt });
    return failure(error);
  }
};
