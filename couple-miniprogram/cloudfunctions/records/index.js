const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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
  const couple = await findMine(OPENID);
  if (!couple) throw new Error("COUPLE_REQUIRED");

  if (action === "create") {
    const record = event.record || {};
    if (!record.type || !record.title || !record.content) {
      throw new Error("INVALID_RECORD");
    }

    const now = new Date();
    const data = {
      coupleId: couple._id,
      type: record.type,
      title: String(record.title).trim(),
      content: String(record.content).trim(),
      payload: record.payload || {},
      creatorOpenid: OPENID,
      createdAt: now,
      updatedAt: now
    };
    const addRes = await db.collection("records").add({ data });
    return { record: { _id: addRes._id, ...data } };
  }

  if (action === "list") {
    const res = await db
      .collection("records")
      .where({ coupleId: couple._id })
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    return { records: res.data };
  }

  throw new Error("UNKNOWN_ACTION");
};
