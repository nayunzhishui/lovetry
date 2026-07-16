const cloud = require("wx-server-sdk");
const crypto = require("crypto");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
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

async function findMine(openid) {
  const membershipId = crypto.createHash("sha256").update(openid).digest("hex").slice(0, 32);
  try {
    const membership = (await db.collection("memberships").doc(membershipId).get()).data;
    if (membership && membership.status === "active" && membership.coupleId) {
      const couple = (await db.collection("couples").doc(membership.coupleId).get()).data;
      if (couple && couple.status !== "archived" && couple.members.includes(openid)) return couple;
    }
  } catch (error) {
    // Existing projects are lazily migrated from the couples.members array below.
  }
  const result = await db
    .collection("couples")
    .where({ members: openid, status: _.neq("archived") })
    .limit(1)
    .get();
  const couple = result.data[0] || null;
  if (couple) {
    await db.collection("memberships").doc(membershipId).set({ data: {
      openid, coupleId: couple._id, status: "active", updatedAt: new Date()
    } });
  }
  return couple;
}

function membershipId(openid) {
  return crypto.createHash("sha256").update(openid).digest("hex").slice(0, 32);
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
      }
      const snapshot = await transaction.collection("couples").doc(coupleId).get();
      const couple = snapshot.data;
      if (!couple || couple.status === "archived" || couple.code !== code) throw businessError("COUPLE_NOT_FOUND");
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
    await db.runTransaction(async (transaction) => {
      const latestResult = await transaction.collection("couples").doc(couple._id).get();
      const latest = latestResult.data;
      if (!latest || latest.status === "archived" || !latest.members.includes(openid)) {
        throw businessError("COUPLE_NOT_FOUND");
      }
      const archivedAt = new Date();
      await transaction.collection("couples").doc(couple._id).update({ data: {
        status: "archived",
        code: "",
        inviteExpiresAt: archivedAt,
        archivedAt,
        archivedBy: openid,
        updatedAt: archivedAt,
        version: Number(latest.version || 1) + 1
      } });
      for (const member of latest.members) {
        await transaction.collection("memberships").doc(membershipId(member)).set({ data: {
          openid: member,
          coupleId: couple._id,
          status: "archived",
          updatedAt: archivedAt
        } });
      }
    });
    return success({ couple: null });
  }

  throw businessError("UNKNOWN_ACTION");
}

exports.main = async (event = {}) => {
  const startedAt = Date.now();
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
