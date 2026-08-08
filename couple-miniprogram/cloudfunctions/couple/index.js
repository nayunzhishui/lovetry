process.env.TZ = "Asia/Shanghai";
const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const { COOLING_OFF_DAYS, computePurgeAt, isPurgeDue } = require("./archive-policy");
const { archiveAccessData, archiveAccessId, listArchivedCouples } = require("./archive-access");
const { membershipId, resolveActiveCouple } = require("./membership");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const findMine = (openid) => resolveActiveCouple(db, _, openid);
const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const INVITE_LENGTH = 8;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ERROR_MESSAGES = {
  JOIN_CODE_REQUIRED: "请输入加入码",
  COUPLE_NOT_FOUND: "未找到对应的情侣空间",
  COUPLE_FULL: "该情侣空间已有两位成员",
  INVITE_EXPIRED: "加入码已过期，请让伴侣重新生成",
  INVALID_PROFILE: "情侣资料格式不正确",
  LEAVE_CONFIRM_REQUIRED: "解除关系前需要再次确认",
  ALREADY_IN_COUPLE: "当前账号已属于另一个情侣空间",
  INVITE_CODE_GENERATION_FAILED: "暂时无法生成加入码，请稍后重试",
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

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^2-9A-HJ-NP-Z]/g, "");
}

function randomCode() {
  const bytes = crypto.randomBytes(INVITE_LENGTH);
  let code = "";
  for (let index = 0; index < INVITE_LENGTH; index += 1) {
    code += INVITE_ALPHABET[bytes[index] % INVITE_ALPHABET.length];
  }
  return code;
}

async function createUniqueCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    const existing = await db.collection("couples").where({ code }).limit(1).get();
    if (existing.data.length === 0) return code;
  }
  throw businessError("INVITE_CODE_GENERATION_FAILED", "暂时无法生成加入码，请稍后重试");
}

// 判断 CloudBase“文档不存在”类错误：只有这类错误才能当作“当前账号还没有 membership”继续走下去；
// 其余数据库异常（网络、权限、超时等）必须向上抛出，否则会把已有成员误判为可再次创建/加入。
function isDocMissingError(error) {
  if (!error) return false;
  if (error.errCode === -502004) return true;
  const text = `${String(error.message || "")} ${String(error.errMsg || "")}`;
  return text.includes("document.get:fail") || text.includes("does not exist") || text.includes("DOCUMENT_NOT_FOUND");
}

function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// 给伴侣写站内提醒（notifications 集合，结构对齐 notifications 云函数 materializeMine 写入的文档）。
// 提醒写入失败不能影响主流程：吞掉并 console.error。
async function notifyPartner(couple, senderOpenid, type, title, body) {
  try {
    const recipients = (Array.isArray(couple.members) ? couple.members : [])
      .filter((member) => member && member !== senderOpenid);
    const now = new Date();
    await Promise.all(recipients.map((recipientOpenid) => db.collection("notifications").add({ data: {
      coupleId: couple._id,
      recipientOpenid,
      type,
      sourceId: couple._id,
      title,
      body: String(body || ""),
      scheduledDate: localDate(now),
      daysRemaining: 0,
      readAt: null,
      createdAt: now,
      updatedAt: now
    } })));
  } catch (error) {
    console.error("couple notification write failed", { type, code: error.code || error.message });
  }
}

// 最终归档：原 leave 里的事务归档逻辑，抽出来供定时触发器到期执行复用。
async function finalizeArchive(coupleId, archivedBy) {
  await db.runTransaction(async (transaction) => {
    const latestResult = await transaction.collection("couples").doc(coupleId).get();
    const latest = latestResult.data;
    if (!latest || latest.status === "archived") return;
    const archivedAt = new Date();
    const archivedCouple = { ...latest, _id: coupleId, status: "archived", archivedAt, updatedAt: archivedAt };
    await transaction.collection("couples").doc(coupleId).update({ data: {
      status: "archived",
      code: "",
      inviteExpiresAt: archivedAt,
      archivedAt,
      archivedBy: archivedBy || latest.leaveRequestedBy || "",
      updatedAt: archivedAt,
      version: Number(latest.version || 1) + 1
    } });
    for (const member of latest.members) {
      await transaction.collection("memberships").doc(membershipId(member)).set({ data: {
        openid: member,
        coupleId,
        status: "archived",
        updatedAt: archivedAt
      } });
      await transaction.collection("relationship_archives").doc(archiveAccessId(member, coupleId)).set({
        data: archiveAccessData(member, archivedCouple, archivedAt)
      });
    }
  });
}

// 定时触发器入口：扫描冷静期已到的 archiving 空间并执行最终归档（每天一批，最多 20 个）。
async function purgeDueArchivingCouples() {
  const now = new Date();
  const result = await db
    .collection("couples")
    .where({ status: "archiving", scheduledPurgeAt: _.lte(now) })
    .limit(20)
    .get();
  let archived = 0;
  for (const couple of result.data) {
    // 查询与归档之间可能被撤销：进事务前用纯函数再确认一次到期条件
    if (!isPurgeDue(couple, now)) continue;
    try {
      await finalizeArchive(couple._id, couple.leaveRequestedBy || "");
      archived += 1;
    } catch (error) {
      console.error("couple timer archive failed", { coupleId: couple._id, code: error.code || error.message });
    }
  }
  console.info("couple purgeDueArchivingCouples", { scanned: result.data.length, archived });
  return { scanned: result.data.length, archived };
}

function sanitizeProfile(profile) {
  const next = {};
  if (Object.prototype.hasOwnProperty.call(profile, "spaceName")) {
    next.spaceName = String(profile.spaceName || "").trim().slice(0, 30);
  }
  if (Object.prototype.hasOwnProperty.call(profile, "anniversaryDate")) {
    const value = String(profile.anniversaryDate || "").trim();
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw businessError("INVALID_PROFILE");
    }
    next.anniversaryDate = value;
  }
  return next;
}

async function handle(event, openid) {
  const action = event.action;

  if (action === "mine") {
    return success({ couple: await findMine(openid) });
  }

  if (action === "listArchives") {
    return success({ archives: await listArchivedCouples(db, openid, 20) });
  }

  if (action === "create") {
    const current = await findMine(openid);
    if (current) return success({ couple: current });

    const now = new Date();
    const code = await createUniqueCode();
    const coupleId = crypto.randomBytes(16).toString("hex");
    const data = {
      code,
      members: [openid],
      createdBy: openid,
      status: "active",
      spaceName: "我们的小空间",
      anniversaryDate: "",
      inviteExpiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      version: 1,
      createdAt: now,
      updatedAt: now
    };
    await db.runTransaction(async (transaction) => {
      const memberDoc = transaction.collection("memberships").doc(membershipId(openid));
      try {
        const existing = (await memberDoc.get()).data;
        if (existing && existing.status === "active") throw businessError("ALREADY_IN_COUPLE");
      } catch (error) {
        if (error.code === "ALREADY_IN_COUPLE") throw error;
        // 只吞“文档不存在”（表示还没有 membership），其余数据库异常必须让事务失败。
        if (!isDocMissingError(error)) throw error;
      }
      await transaction.collection("couples").doc(coupleId).set({ data });
      await memberDoc.set({ data: { openid, coupleId, status: "active", updatedAt: now } });
    });
    return success({ couple: { _id: coupleId, ...data } });
  }

  if (action === "join") {
    const code = normalizeCode(event.code);
    if (!code) throw businessError("JOIN_CODE_REQUIRED");

    const current = await findMine(openid);
    if (current) return success({ couple: current });

    const found = await db
      .collection("couples")
      .where({ code, status: _.neq("archived") })
      .limit(1)
      .get();
    if (!found.data[0]) throw businessError("COUPLE_NOT_FOUND");

    const coupleId = found.data[0]._id;
    await db.runTransaction(async (transaction) => {
      const memberDoc = transaction.collection("memberships").doc(membershipId(openid));
      try {
        const membership = (await memberDoc.get()).data;
        if (membership && membership.status === "active") throw businessError("ALREADY_IN_COUPLE");
      } catch (error) {
        if (error.code === "ALREADY_IN_COUPLE") throw error;
        // 只吞“文档不存在”（表示还没有 membership），其余数据库异常必须让事务失败。
        if (!isDocMissingError(error)) throw error;
      }
      const snapshot = await transaction.collection("couples").doc(coupleId).get();
      const couple = snapshot.data;
      // archiving（解绑冷静期）状态的空间不接受新的加入：邀请码在发起解除时即视为失效
      if (!couple || couple.status !== "active" || couple.code !== code) throw businessError("COUPLE_NOT_FOUND");
      const members = Array.isArray(couple.members) ? couple.members : [];
      if (couple.inviteExpiresAt && new Date(couple.inviteExpiresAt).getTime() < Date.now()) {
        throw businessError("INVITE_EXPIRED");
      }
      if (members.includes(openid)) return;
      if (members.length >= 2) throw businessError("COUPLE_FULL");
      await transaction.collection("couples").doc(coupleId).update({
        data: {
          members: [...members, openid],
          updatedAt: new Date(),
          version: Number(couple.version || 0) + 1
        }
      });
      await memberDoc.set({ data: { openid, coupleId, status: "active", updatedAt: new Date() } });
    });

    return success({ couple: await findMine(openid) });
  }

  if (action === "refreshInvite") {
    const couple = await findMine(openid);
    if (!couple) throw businessError("COUPLE_NOT_FOUND");
    if (couple.members.length >= 2) throw businessError("COUPLE_FULL");
    const code = await createUniqueCode();
    const updatedAt = new Date();
    const inviteExpiresAt = new Date(updatedAt.getTime() + INVITE_TTL_MS);
    const version = Number(couple.version || 0) + 1;
    await db.collection("couples").doc(couple._id).update({
      data: {
        code,
        inviteExpiresAt,
        updatedAt,
        version
      }
    });
    return success({ couple: { ...couple, code, inviteExpiresAt, updatedAt, version } });
  }

  if (action === "updateProfile") {
    const couple = await findMine(openid);
    if (!couple) throw businessError("COUPLE_NOT_FOUND");
    const profile = sanitizeProfile(event.profile || {});
    const updatedAt = new Date();
    const version = Number(couple.version || 0) + 1;
    await db.collection("couples").doc(couple._id).update({
      data: { ...profile, updatedAt, version }
    });
    return success({ couple: { ...couple, ...profile, updatedAt, version } });
  }

  if (action === "leave") {
    if (event.confirmText !== "LEAVE_COUPLE") {
      throw businessError("LEAVE_CONFIRM_REQUIRED");
    }
    const couple = await findMine(openid);
    if (!couple) throw businessError("COUPLE_NOT_FOUND");
    // 两阶段解绑：先进入 7 天冷静期（archiving），到期由定时触发器执行最终归档。
    // 重复发起视为幂等：已在冷静期内直接返回当前状态。
    if (couple.status === "archiving") return success({ couple });
    const now = new Date();
    const scheduledPurgeAt = computePurgeAt(now);
    const next = {
      status: "archiving",
      scheduledPurgeAt,
      leaveRequestedBy: openid,
      leaveRequestedAt: now,
      updatedAt: now,
      version: Number(couple.version || 0) + 1
    };
    await db.collection("couples").doc(couple._id).update({ data: next });
    await notifyPartner(
      couple,
      openid,
      "coupleArchiving",
      "TA 发起了解除情侣空间",
      `空间将在 ${COOLING_OFF_DAYS} 天后归档；冷静期内你们都可以在设置页撤销，也可以先导出备份。`
    );
    return success({ couple: { ...couple, ...next } });
  }

  if (action === "cancelLeave") {
    const couple = await findMine(openid);
    if (!couple) throw businessError("COUPLE_NOT_FOUND");
    // 任一成员都可撤销（被动方也应能挽回）；非冷静期状态下视为幂等。
    if (couple.status !== "archiving") return success({ couple });
    const now = new Date();
    const next = {
      status: "active",
      scheduledPurgeAt: null,
      leaveRequestedBy: "",
      leaveRequestedAt: null,
      updatedAt: now,
      version: Number(couple.version || 0) + 1
    };
    await db.collection("couples").doc(couple._id).update({ data: next });
    await notifyPartner(
      couple,
      openid,
      "coupleArchivingCancelled",
      "解除申请已撤销",
      "你们的空间恢复正常，一切记录都还在。"
    );
    return success({ couple: { ...couple, ...next } });
  }

  throw businessError("UNKNOWN_ACTION");
}

exports.main = async (event = {}) => {
  const startedAt = Date.now();
  // 定时触发器（无用户上下文）：归档冷静期已到的 archiving 空间。
  if (event.Type === "Timer" || event.TriggerName) {
    try {
      return { ok: true, data: await purgeDueArchivingCouples() };
    } catch (error) {
      console.error("couple timer archive failed", { code: error.code || error.message });
      return { ok: false };
    }
  }
  const { OPENID } = cloud.getWXContext();
  try {
    const result = await handle(event, OPENID);
    console.info("couple function completed", { traceId: event._traceId || "", action: event.action || "mine", code: "OK", durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    console.error("couple function failed", {
      traceId: event._traceId || "",
      action: event.action,
      code: error.code || error.message,
      durationMs: Date.now() - startedAt
    });
    return failure(error);
  }
};
