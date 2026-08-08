// 与其他云函数目录内同名文件保持一致（records/rewards/plans/media/dashboard/notifications 各持有一份拷贝）。
// 云函数之间不能互相 require（各自独立打包部署），修改本文件时请同步更新所有拷贝。
//
// memberships 集合由 couple 云函数维护：文档 ID 为 openid 的 SHA-256 十六进制前 32 位，
// 字段为 { openid, coupleId, status, updatedAt }，在 create/join/leave 及 mine 懒迁移时写入。
// 本模块只做只读快路径：先按哈希主键 O(1) 命中 memberships，再回读 couples 校验状态与成员；
// miss 或数据不一致（已归档、成员不含本人等）时回退到 couples.where 条件查询，
// 兼容 memberships 集合尚未建立或存在历史脏数据的情况（回退是必须的，不能省略）。
const crypto = require("crypto");

function membershipId(openid) {
  return crypto.createHash("sha256").update(String(openid || "")).digest("hex").slice(0, 32);
}

function isMembershipUsable(membership, openid) {
  if (!membership || membership.status !== "active" || !membership.coupleId) return false;
  // 正常写入的文档都带 openid；带且与当前用户不一致时视为脏数据，走回退查询。
  return !membership.openid || membership.openid === openid;
}

function isCoupleUsable(couple, openid) {
  return Boolean(
    couple &&
    couple.status !== "archived" &&
    Array.isArray(couple.members) &&
    couple.members.includes(openid)
  );
}

async function findMineViaMembership(db, openid) {
  try {
    const membership = (await db.collection("memberships").doc(membershipId(openid)).get()).data;
    if (isMembershipUsable(membership, openid)) {
      const couple = (await db.collection("couples").doc(membership.coupleId).get()).data;
      if (isCoupleUsable(couple, openid)) return { _id: membership.coupleId, ...couple };
    }
  } catch (error) {
    // memberships 未建立、文档不存在或读取失败：统一走下方回退查询，保证行为不比全表条件查询差。
  }
  const fallback = await db
    .collection("couples")
    .where({ members: openid, status: db.command.neq("archived") })
    .limit(1)
    .get();
  return fallback.data[0] || null;
}

module.exports = { membershipId, isMembershipUsable, isCoupleUsable, findMineViaMembership };
