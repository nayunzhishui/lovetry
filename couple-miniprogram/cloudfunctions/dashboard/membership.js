const crypto = require("crypto");

function membershipId(openid) {
  return crypto.createHash("sha256").update(String(openid || "")).digest("hex").slice(0, 32);
}

function isActiveMember(couple, openid) {
  return Boolean(
    couple
    && couple.status !== "archived"
    && Array.isArray(couple.members)
    && couple.members.includes(openid)
  );
}

async function resolveActiveCouple(db, command, openid) {
  if (!db || !command || !openid) return null;
  const id = membershipId(openid);
  let membership = null;
  let membershipFound = false;

  try {
    membership = (await db.collection("memberships").doc(id).get()).data || null;
    membershipFound = Boolean(membership);
  } catch (error) {
    // Existing deployments may not have deterministic membership documents yet.
  }

  if (membershipFound) {
    if (membership.status !== "active" || !membership.coupleId) return null;
    try {
      const couple = (await db.collection("couples").doc(membership.coupleId).get()).data;
      return isActiveMember(couple, openid) ? couple : null;
    } catch (error) {
      return null;
    }
  }

  const result = await db
    .collection("couples")
    .where({ members: openid, status: command.neq("archived") })
    .limit(1)
    .get();
  const couple = result.data[0] || null;
  if (!isActiveMember(couple, openid)) return null;

  await db.collection("memberships").doc(id).set({
    data: {
      openid,
      coupleId: couple._id,
      status: "active",
      updatedAt: new Date()
    }
  });
  return couple;
}

module.exports = { isActiveMember, membershipId, resolveActiveCouple };
