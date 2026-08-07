const crypto = require("crypto");

function archiveAccessId(openid, coupleId) {
  return crypto.createHash("sha256").update(`${openid}:${coupleId}`).digest("hex").slice(0, 32);
}

function archiveAccessData(openid, couple, archivedAt) {
  return {
    ownerOpenid: openid,
    coupleId: couple._id,
    archivedAt: archivedAt || couple.archivedAt || couple.updatedAt || new Date(),
    createdAt: archivedAt || couple.archivedAt || couple.updatedAt || new Date()
  };
}

function validArchivedCouple(couple, openid) {
  return Boolean(couple && couple.status === "archived" && Array.isArray(couple.members) && couple.members.includes(openid));
}

async function ensureArchiveAccess(db, openid, couple) {
  if (!validArchivedCouple(couple, openid)) return null;
  const id = archiveAccessId(openid, couple._id);
  const data = archiveAccessData(openid, couple);
  await db.collection("relationship_archives").doc(id).set({ data });
  return { _id: id, ...data };
}

async function resolveArchivedCouple(db, openid, coupleId) {
  if (!openid || !coupleId) return null;
  const id = archiveAccessId(openid, coupleId);
  let access = null;
  try { access = (await db.collection("relationship_archives").doc(id).get()).data || null; }
  catch (error) { /* legacy archive may not have an access document yet */ }
  if (access && (access.ownerOpenid !== openid || access.coupleId !== coupleId)) return null;

  let couple = null;
  try { couple = (await db.collection("couples").doc(coupleId).get()).data || null; }
  catch (error) { return null; }
  if (!validArchivedCouple(couple, openid)) return null;
  if (!access) await ensureArchiveAccess(db, openid, couple);
  return couple;
}

async function listArchivedCouples(db, openid, limit = 20) {
  const max = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const accessResult = await db.collection("relationship_archives").where({ ownerOpenid: openid }).limit(max).get();
  const accessByCouple = new Map((accessResult.data || []).map((item) => [item.coupleId, item]));

  const legacyResult = await db.collection("couples").where({ members: openid, status: "archived" }).limit(max).get();
  for (const couple of legacyResult.data || []) {
    if (!validArchivedCouple(couple, openid)) continue;
    if (!accessByCouple.has(couple._id)) {
      const access = await ensureArchiveAccess(db, openid, couple);
      if (access) accessByCouple.set(couple._id, access);
    }
  }

  const couples = await Promise.all([...accessByCouple.values()].slice(0, max).map(async (access) => {
    try {
      const couple = (await db.collection("couples").doc(access.coupleId).get()).data;
      if (!validArchivedCouple(couple, openid)) return null;
      return {
        _id: couple._id,
        spaceName: String(couple.spaceName || "历史情侣空间").slice(0, 30),
        anniversaryDate: String(couple.anniversaryDate || "").slice(0, 10),
        archivedAt: couple.archivedAt || access.archivedAt || couple.updatedAt || null
      };
    } catch (error) {
      return null;
    }
  }));

  return couples.filter(Boolean).sort((a, b) => new Date(b.archivedAt || 0) - new Date(a.archivedAt || 0));
}

module.exports = {
  archiveAccessData,
  archiveAccessId,
  ensureArchiveAccess,
  listArchivedCouples,
  resolveArchivedCouple,
  validArchivedCouple
};
