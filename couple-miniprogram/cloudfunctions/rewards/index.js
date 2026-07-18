const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const { normalizeRewardItem, transitionRewardItem } = require("./reward-policy");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const ERROR_MESSAGES = {
  COUPLE_REQUIRED: "请先创建或加入情侣空间",
  INVALID_AMOUNT: "积分必须是大于零的整数",
  INVALID_TARGET: "请选择情侣空间内的成员",
  SELF_APPROVAL_NOT_ALLOWED: "奖励需要由伴侣确认",
  INSUFFICIENT_BALANCE: "当前积分余额不足",
  TASK_NOT_FOUND: "未找到可结算的已完成任务",
  REWARD_ALREADY_SETTLED: "该奖励已经结算",
  IDEMPOTENCY_KEY_REQUIRED: "请求标识缺失，请重试",
  IDEMPOTENCY_CONFLICT: "重复请求的内容不一致",
  INVALID_REWARD_ITEM: "请填写有效的奖励名称和积分",
  UNSAFE_REWARD_ITEM: "这类约定不能作为积分奖励，请改为双方自愿沟通",
  REWARD_REVIEW_REQUIRED: "奖励需要由伴侣确认后才能兑换",
  REWARD_ITEM_NOT_FOUND: "奖励商品不存在或已下架",
  INVENTORY_NOT_FOUND: "仓库条目不存在",
  INVALID_REWARD_STATE: "奖励状态不能这样变更",
  NO_PERMISSION: "无权执行这个操作",
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

function walletId(coupleId, openid) {
  return `${coupleId}_${openid}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function amount(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100000) {
    throw businessError("INVALID_AMOUNT");
  }
  return parsed;
}

async function ensureWallet(couple, openid) {
  const id = walletId(couple._id, openid);
  try {
    const result = await db.collection("wallets").doc(id).get();
    return result.data;
  } catch (error) {
    return db.runTransaction(async (transaction) => {
      try {
        const existing = (await transaction.collection("wallets").doc(id).get()).data;
        if (existing) return existing;
      } catch (missingError) {
        // Create the deterministic wallet below.
      }
      const now = new Date();
      const data = {
        coupleId: couple._id,
        ownerOpenid: openid,
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
        version: 1,
        createdAt: now,
        updatedAt: now
      };
      await transaction.collection("wallets").doc(id).set({ data });
      return { _id: id, ...data };
    });
  }
}

function transactionId(coupleId, idempotencyKey) {
  return crypto.createHash("sha256").update(`${coupleId}:${idempotencyKey}`).digest("hex").slice(0, 32);
}

async function existingTransaction(coupleId, idempotencyKey) {
  if (!idempotencyKey) return null;
  try {
    const result = await db.collection("reward_transactions").doc(transactionId(coupleId, idempotencyKey)).get();
    return result.data || null;
  } catch (error) {
    return null;
  }
}

async function applyTransaction({ couple, actorOpenid, targetOpenid, kind, value, title, sourceType, sourceId, idempotencyKey }) {
  if (!couple.members.includes(targetOpenid)) throw businessError("INVALID_TARGET");
  const points = amount(value);
  const stableKey = String(idempotencyKey || `${kind}:${couple._id}:${targetOpenid}:${Date.now()}:${crypto.randomBytes(4).toString("hex")}`);
  const rewardTransactionId = transactionId(couple._id, stableKey);
  const duplicate = await existingTransaction(couple._id, stableKey);
  if (duplicate) {
    if (duplicate.ownerOpenid !== targetOpenid || duplicate.kind !== kind || Number(duplicate.amount) !== points) {
      throw businessError("IDEMPOTENCY_CONFLICT");
    }
    return { transaction: duplicate, duplicate: true };
  }
  const wallet = await ensureWallet(couple, targetOpenid);
  const delta = kind === "earn" ? points : -points;
  if (wallet.balance + delta < 0) throw businessError("INSUFFICIENT_BALANCE");

  const result = await db.runTransaction(async (transaction) => {
    const latestResult = await transaction.collection("wallets").doc(wallet._id).get();
    const latest = latestResult.data;
    if (kind === "spend" && latest.balance < points) throw businessError("INSUFFICIENT_BALANCE");

    try {
      const duplicateResult = await transaction.collection("reward_transactions").doc(rewardTransactionId).get();
      if (duplicateResult.data) {
        if (duplicateResult.data.ownerOpenid !== targetOpenid || duplicateResult.data.kind !== kind || Number(duplicateResult.data.amount) !== points) {
          throw businessError("IDEMPOTENCY_CONFLICT");
        }
        return { transaction: duplicateResult.data, duplicate: true };
      }
    } catch (error) {
      if (error.code === "IDEMPOTENCY_CONFLICT") throw error;
      // The deterministic transaction document does not exist yet.
    }

    const now = new Date();
    const transactionData = {
      coupleId: couple._id,
      ownerOpenid: targetOpenid,
      actorOpenid,
      kind,
      amount: points,
      delta,
      title: String(title || (kind === "earn" ? "获得积分" : "消费积分")).trim().slice(0, 80),
      sourceType: String(sourceType || "manual").slice(0, 30),
      sourceId: String(sourceId || "").slice(0, 80),
      idempotencyKey: stableKey.slice(0, 160),
      createdAt: now
    };
    await transaction.collection("reward_transactions").doc(rewardTransactionId).set({ data: transactionData });
    await transaction.collection("wallets").doc(wallet._id).update({
      data: {
        balance: latest.balance + delta,
        totalEarned: latest.totalEarned + (kind === "earn" ? points : 0),
        totalSpent: latest.totalSpent + (kind === "spend" ? points : 0),
        version: Number(latest.version || 1) + 1,
        updatedAt: now
      }
    });
    return { transaction: { _id: rewardTransactionId, ...transactionData }, duplicate: false };
  });

  return result;
}

async function handle(event, openid) {
  const couple = await findMine(openid);
  if (!couple) throw businessError("COUPLE_REQUIRED");
  const action = event.action;

  if (action === "summary") {
    const wallets = await Promise.all(couple.members.map((member) => ensureWallet(couple, member)));
    return success({ wallets });
  }

  if (action === "list") {
    const ownerOpenid = event.ownerOpenid && couple.members.includes(event.ownerOpenid) ? event.ownerOpenid : openid;
    const limit = Math.min(Math.max(Number(event.limit) || 30, 1), 50);
    const result = await db
      .collection("reward_transactions")
      .where({ coupleId: couple._id, ownerOpenid })
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return success({ transactions: result.data });
  }

  if (action === "pendingTasks") {
    const partnerOpenid = couple.members.find((member) => member !== openid);
    if (!partnerOpenid) return success({ tasks: [] });
    const result = await db.collection("plans")
      .where({ coupleId: couple._id, type: "task", status: "done", deletedAt: null })
      .orderBy("updatedAt", "desc")
      .limit(50)
      .get();
    const candidates = result.data.filter((task) =>
      !task.deletedAt && Number(task.rewardPoints) > 0 &&
      Array.isArray(task.assigneeOpenids) && task.assigneeOpenids.includes(partnerOpenid)
    );
    const settled = await Promise.all(candidates.map((task) =>
      existingTransaction(couple._id, `task:${task._id}:reward`)
    ));
    return success({ tasks: candidates.filter((task, index) => !settled[index]) });
  }

  if (action === "listCatalog") {
    const results = await Promise.all(["active", "proposed"].map((status) =>
      db.collection("reward_items").where({ coupleId: couple._id, status }).orderBy("createdAt", "desc").limit(100).get()
    ));
    const items = results.flatMap((result) => result.data).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ).slice(0, 100);
    return success({ items });
  }

  if (action === "createItem") {
    const now = new Date();
    const data = { coupleId: couple._id, ...normalizeRewardItem(event.item), createdBy: openid, createdAt: now, updatedAt: now };
    const result = await db.collection("reward_items").add({ data });
    return success({ item: { _id: result._id, ...data } });
  }

  if (action === "reviewItem") {
    const item = await db.runTransaction(async (transaction) => {
      let current;
      try { current = (await transaction.collection("reward_items").doc(event.itemId).get()).data; }
      catch (error) { throw businessError("REWARD_ITEM_NOT_FOUND"); }
      if (!current || current.coupleId !== couple._id || current.status !== "proposed") throw businessError("REWARD_ITEM_NOT_FOUND");
      const actorRole = current.createdBy === openid ? "creator" : "partner";
      const status = transitionRewardItem(current.status, event.status, actorRole);
      const updatedAt = new Date();
      await transaction.collection("reward_items").doc(current._id).update({ data: { status, reviewedBy: openid, updatedAt } });
      return { ...current, status, reviewedBy: openid, updatedAt };
    });
    return success({ item });
  }

  if (action === "archiveItem") {
    const item = await db.runTransaction(async (transaction) => {
      let current;
      try { current = (await transaction.collection("reward_items").doc(event.itemId).get()).data; }
      catch (error) { throw businessError("REWARD_ITEM_NOT_FOUND"); }
      if (!current || current.coupleId !== couple._id || !["active", "proposed"].includes(current.status)) throw businessError("REWARD_ITEM_NOT_FOUND");
      transitionRewardItem(current.status, "archived", current.createdBy === openid ? "creator" : "partner");
      const updatedAt = new Date();
      await transaction.collection("reward_items").doc(current._id).update({ data: { status: "archived", updatedAt } });
      return { ...current, status: "archived", updatedAt };
    });
    return success({ itemId: item._id });
  }

  if (action === "redeemItem") {
    if (!String(event.idempotencyKey || "").trim()) throw businessError("IDEMPOTENCY_KEY_REQUIRED");
    const itemId = String(event.itemId || "");
    const wallet = await ensureWallet(couple, openid);
    const stableKey = String(event.idempotencyKey).slice(0, 160);
    const inventoryId = transactionId(couple._id, `inventory:${stableKey}`);
    const rewardTransactionId = transactionId(couple._id, stableKey);
    const result = await db.runTransaction(async (transaction) => {
      try {
        const existing = (await transaction.collection("reward_inventory").doc(inventoryId).get()).data;
        if (existing) {
          if (existing.itemId !== itemId || existing.ownerOpenid !== openid) throw businessError("IDEMPOTENCY_CONFLICT");
          return { inventory: existing, duplicate: true };
        }
      } catch (error) {
        if (error.code === "IDEMPOTENCY_CONFLICT") throw error;
      }
      let item;
      try { item = (await transaction.collection("reward_items").doc(itemId).get()).data; }
      catch (error) { throw businessError("REWARD_ITEM_NOT_FOUND"); }
      if (!item || item.coupleId !== couple._id || item.status !== "active") throw businessError("REWARD_ITEM_NOT_FOUND");
      const latest = (await transaction.collection("wallets").doc(wallet._id).get()).data;
      if (Number(latest.balance) < Number(item.points)) throw businessError("INSUFFICIENT_BALANCE");
      const now = new Date();
      const inventoryData = {
        coupleId: couple._id, itemId: item._id, ownerOpenid: openid, title: item.title,
        detail: item.detail || "", points: item.points, status: "pending", idempotencyKey: stableKey,
        createdAt: now, updatedAt: now
      };
      const transactionData = {
        coupleId: couple._id, ownerOpenid: openid, actorOpenid: openid, kind: "spend",
        amount: item.points, delta: -item.points, title: `兑换：${item.title}`, sourceType: "reward_item",
        sourceId: item._id, idempotencyKey: stableKey, createdAt: now
      };
      await transaction.collection("reward_inventory").doc(inventoryId).set({ data: inventoryData });
      await transaction.collection("reward_transactions").doc(rewardTransactionId).set({ data: transactionData });
      await transaction.collection("wallets").doc(wallet._id).update({ data: {
        balance: Number(latest.balance) - Number(item.points),
        totalSpent: Number(latest.totalSpent) + Number(item.points),
        version: Number(latest.version || 1) + 1, updatedAt: now
      } });
      return { inventory: { _id: inventoryId, ...inventoryData }, transaction: { _id: rewardTransactionId, ...transactionData }, duplicate: false };
    });
    return success(result);
  }

  if (action === "listInventory") {
    const result = await db.collection("reward_inventory").where({ coupleId: couple._id }).orderBy("createdAt", "desc").limit(100).get();
    return success({ inventory: result.data });
  }

  if (action === "setInventoryStatus") {
    const inventory = await db.runTransaction(async (transaction) => {
      let current;
      try { current = (await transaction.collection("reward_inventory").doc(event.inventoryId).get()).data; } catch (error) { throw businessError("INVENTORY_NOT_FOUND"); }
      if (!current || current.coupleId !== couple._id) throw businessError("INVENTORY_NOT_FOUND");
      const next = event.status;
      const partnerOpenid = couple.members.find((member) => member !== current.ownerOpenid);
      const allowed = (current.status === "pending" && next === "ready" && openid === partnerOpenid) ||
        (current.status === "ready" && next === "used" && openid === current.ownerOpenid);
      if (!allowed) throw businessError(openid === current.ownerOpenid && current.status === "pending" ? "SELF_APPROVAL_NOT_ALLOWED" : "INVALID_REWARD_STATE");
      const updatedAt = new Date();
      await transaction.collection("reward_inventory").doc(current._id).update({ data: { status: next, updatedAt, updatedBy: openid } });
      return { ...current, status: next, updatedAt, updatedBy: openid };
    });
    return success({ inventory });
  }

  if (action === "grant") {
    if (!String(event.idempotencyKey || "").trim()) throw businessError("IDEMPOTENCY_KEY_REQUIRED");
    const targetOpenid = event.targetOpenid;
    if (targetOpenid === openid) throw businessError("SELF_APPROVAL_NOT_ALLOWED");
    return success(
      await applyTransaction({
        couple,
        actorOpenid: openid,
        targetOpenid,
        kind: "earn",
        value: event.amount,
        title: event.title,
        sourceType: event.sourceType || "manual",
        sourceId: event.sourceId,
        idempotencyKey: event.idempotencyKey
      })
    );
  }

  if (action === "spend") {
    if (!String(event.idempotencyKey || "").trim()) throw businessError("IDEMPOTENCY_KEY_REQUIRED");
    return success(
      await applyTransaction({
        couple,
        actorOpenid: openid,
        targetOpenid: openid,
        kind: "spend",
        value: event.amount,
        title: event.title,
        sourceType: event.sourceType || "redeem",
        sourceId: event.sourceId,
        idempotencyKey: event.idempotencyKey
      })
    );
  }

  if (action === "settleTask") {
    const taskResult = await db.collection("plans").doc(event.planId).get();
    const task = taskResult.data;
    if (!task || task.coupleId !== couple._id || task.type !== "task" || task.status !== "done" || task.deletedAt) {
      throw businessError("TASK_NOT_FOUND");
    }
    const targetOpenid = event.targetOpenid || task.assigneeOpenids?.[0];
    if (!targetOpenid || !couple.members.includes(targetOpenid)) throw businessError("INVALID_TARGET");
    if (!Array.isArray(task.assigneeOpenids) || !task.assigneeOpenids.includes(targetOpenid)) {
      throw businessError("INVALID_TARGET");
    }
    if (targetOpenid === openid) throw businessError("SELF_APPROVAL_NOT_ALLOWED");
    return success(
      await applyTransaction({
        couple,
        actorOpenid: openid,
        targetOpenid,
        kind: "earn",
        value: task.rewardPoints,
        title: `完成任务：${task.title}`,
        sourceType: "task",
        sourceId: task._id,
        idempotencyKey: `task:${task._id}:reward`
      })
    );
  }

  throw businessError("UNKNOWN_ACTION");
}

exports.main = async (event = {}) => {
  const startedAt = Date.now();
  const { OPENID } = cloud.getWXContext();
  try {
    const result = await handle(event, OPENID);
    console.info("rewards function completed", { traceId: event._traceId || "", action: event.action || "", code: "OK", durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    console.error("rewards function failed", { traceId: event._traceId || "", action: event.action, code: error.code || error.message, durationMs: Date.now() - startedAt });
    return failure(error);
  }
};
