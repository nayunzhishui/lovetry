const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function findMine(openid) {
  const res = await db
    .collection("couples")
    .where({ members: openid })
    .limit(1)
    .get();
  return res.data[0] || null;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  if (action === "mine") {
    return { couple: await findMine(OPENID) };
  }

  if (action === "create") {
    const current = await findMine(OPENID);
    if (current) return { couple: current };

    const code = makeCode();
    const createdAt = new Date();
    const addRes = await db.collection("couples").add({
      data: {
        code,
        members: [OPENID],
        createdBy: OPENID,
        createdAt
      }
    });

    return {
      couple: {
        _id: addRes._id,
        code,
        members: [OPENID],
        createdBy: OPENID,
        createdAt
      }
    };
  }

  if (action === "join") {
    const code = String(event.code || "").trim().toUpperCase();
    if (!code) throw new Error("JOIN_CODE_REQUIRED");

    const current = await findMine(OPENID);
    if (current) return { couple: current };

    const found = await db
      .collection("couples")
      .where({ code })
      .limit(1)
      .get();
    const couple = found.data[0];
    if (!couple) throw new Error("COUPLE_NOT_FOUND");
    if (couple.members.length >= 2 && !couple.members.includes(OPENID)) {
      throw new Error("COUPLE_FULL");
    }

    await db
      .collection("couples")
      .doc(couple._id)
      .update({ data: { members: _.addToSet(OPENID) } });

    return { couple: await findMine(OPENID) };
  }

  throw new Error("UNKNOWN_ACTION");
};
