const cloud = require("wx-server-sdk");
const { validateBackupEnvelope } = require("./backup");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function success(data) {
  return { ok: true, data, ...data };
}

function failure(error) {
  return {
    ok: false,
    error: { code: error.code || error.message || "INTERNAL_ERROR", message: error.userMessage || "加载数据失败" }
  };
}

function businessError(code, userMessage) {
  const error = new Error(code);
  error.code = code;
  error.userMessage = userMessage;
  return error;
}

async function findMine(openid) {
  const result = await db
    .collection("couples")
    .where({ members: openid, status: _.neq("archived") })
    .limit(1)
    .get();
  return result.data[0] || null;
}

function canReadRecord(record, openid) {
  if (record.deletedAt) return false;
  if (!record.visibility) return true;
  return record.visibility === "couple" || record.ownerOpenid === openid || record.creatorOpenid === openid;
}

function inRange(value, start, end) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return timestamp >= start.getTime() && timestamp < end.getTime();
}

function safeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

async function alreadyRestored(collection, coupleId, sourceId) {
  if (!sourceId) return false;
  const result = await db.collection(collection).where({ coupleId, restoredFromId: sourceId }).limit(1).get();
  return result.data.length > 0;
}

async function loadBase(couple, openid, recordLimit = 100, planLimit = 100) {
  const visibleRecords = _.and(
    { coupleId: couple._id },
    _.or(
      { visibility: "couple" },
      { ownerOpenid: openid },
      { creatorOpenid: openid },
      { visibility: _.exists(false) }
    ),
    _.or({ deletedAt: null }, { deletedAt: _.exists(false) })
  );
  const [recordResult, planResult, walletResult] = await Promise.all([
    db.collection("records").where(visibleRecords).orderBy("createdAt", "desc").limit(recordLimit).get(),
    db.collection("plans").where({ coupleId: couple._id, deletedAt: null }).orderBy("createdAt", "desc").limit(planLimit).get(),
    db.collection("wallets").where({ coupleId: couple._id }).limit(2).get()
  ]);
  return {
    records: recordResult.data.filter((record) => canReadRecord(record, openid)),
    plans: planResult.data.filter((plan) => !plan.deletedAt),
    wallets: walletResult.data
  };
}

async function handle(event, openid) {
  const couple = await findMine(openid);
  if (!couple) throw businessError("COUPLE_REQUIRED", "请先创建或加入情侣空间");
  const action = event.action;

  if (action === "summary") {
    const base = await loadBase(couple, openid, 100, 30);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const todayPlans = base.plans.filter((plan) => inRange(plan.startAt || plan.endAt, todayStart, todayEnd));
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const last7Records = base.records.filter((record) => new Date(record.startAt || record.createdAt).getTime() >= sevenDaysAgo);
    return success({
      couple,
      recentRecords: base.records.slice(0, 5),
      todayPlans,
      pendingTasks: base.plans.filter((plan) => plan.type === "task" && plan.status !== "done" && plan.status !== "archived").slice(0, 5),
      anniversaries: base.plans.filter((plan) => plan.type === "anniversary" && plan.status !== "archived").slice(0, 30),
      wallets: base.wallets,
      stats: {
        recordCount7d: last7Records.length,
        focusMinutes7d: last7Records.filter((record) => record.type === "pomodoro")
          .reduce((sum, record) => sum + (Number(record.metrics && record.metrics.durationMinutes) || 0), 0)
      }
    });
  }

  if (action === "calendar") {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw businessError("INVALID_RANGE", "请选择正确的日期范围");
    }
    const base = await loadBase(couple, openid, 300, 300);
    const recordEvents = base.records
      .filter((record) => inRange(record.startAt || record.createdAt, start, end))
      .map((record) => ({ id: record._id, source: "record", type: record.type, title: record.title, startAt: record.startAt || record.createdAt }));
    const planEvents = base.plans
      .filter((plan) => plan.type !== "anniversary")
      .filter((plan) => inRange(plan.startAt || plan.endAt || plan.createdAt, start, end))
      .map((plan) => ({ id: plan._id, source: "plan", type: plan.type, title: plan.title, startAt: plan.startAt || plan.endAt || plan.createdAt, status: plan.status }));
    const anniversaryEvents = [];
    for (const plan of base.plans.filter((item) => item.type === "anniversary" && item.startAt)) {
      const sourceDate = new Date(plan.startAt);
      if (plan.payload && plan.payload.repeatYearly === false) {
        if (inRange(sourceDate, start, end)) anniversaryEvents.push({ id: plan._id, source: "plan", type: "anniversary", title: plan.title, startAt: sourceDate, status: plan.status });
        continue;
      }
      for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
        let recurring = new Date(year, sourceDate.getMonth(), sourceDate.getDate());
        if (sourceDate.getMonth() === 1 && sourceDate.getDate() === 29 && recurring.getMonth() !== 1) recurring = new Date(year, 1, 28);
        if (inRange(recurring, start, end)) anniversaryEvents.push({ id: `${plan._id}-${year}`, planId: plan._id, source: "plan", type: "anniversary", title: plan.title, startAt: recurring, status: plan.status });
      }
    }
    if (couple.anniversaryDate) {
      const sourceDate = new Date(`${couple.anniversaryDate}T00:00:00`);
      for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
        const recurring = new Date(year, sourceDate.getMonth(), sourceDate.getDate());
        if (inRange(recurring, start, end)) anniversaryEvents.push({
          id: `couple-anniversary-${year}`,
          source: "plan",
          type: "anniversary",
          title: "我们的纪念日",
          startAt: recurring
        });
      }
    }
    return success({ events: [...recordEvents, ...planEvents, ...anniversaryEvents].sort((a, b) => new Date(a.startAt) - new Date(b.startAt)) });
  }

  if (action === "search") {
    const keyword = String(event.keyword || "").trim().toLowerCase().slice(0, 50);
    if (!keyword) return success({ results: [] });
    const base = await loadBase(couple, openid, 300, 300);
    const start = event.startAt ? new Date(event.startAt) : null;
    const end = event.endAt ? new Date(event.endAt) : null;
    const source = event.source === "record" || event.source === "plan" ? event.source : "";
    const type = safeText(event.type, 30);
    const dateMatches = (item) => {
      const value = new Date(item.startAt || item.endAt || item.createdAt).getTime();
      return (!start || value >= start.getTime()) && (!end || value < end.getTime() + 86400000);
    };
    const records = source === "plan" ? [] : base.records
      .filter((record) => !type || record.type === type)
      .filter(dateMatches)
      .filter((record) => `${record.title} ${record.content}`.toLowerCase().includes(keyword))
      .map((record) => ({
        id: record._id,
        source: "record",
        type: record.type,
        title: record.title,
        occurredAt: record.startAt || record.createdAt,
        createdAt: record.createdAt
      }));
    const plans = source === "record" ? [] : base.plans
      .filter((plan) => !type || plan.type === type)
      .filter(dateMatches)
      .filter((plan) => `${plan.title} ${plan.detail}`.toLowerCase().includes(keyword))
      .map((plan) => ({
        id: plan._id,
        source: "plan",
        type: plan.type,
        title: plan.title,
        occurredAt: plan.startAt || plan.endAt || plan.createdAt,
        createdAt: plan.createdAt
      }));
    return success({ results: [...records, ...plans].slice(0, 100) });
  }

  if (action === "sync") {
    const now = new Date();
    const since = event.since ? new Date(event.since) : new Date(now.getTime() - 86400000);
    const legacyOffset = Math.min(Math.max(Number(event.offset) || 0, 0), 100000);
    const sourceOffsets = event.offsets && typeof event.offsets === "object" ? event.offsets : {};
    const offsets = ["records", "plans", "notifications"].reduce((result, key) => {
      result[key] = Math.min(Math.max(Number(sourceOffsets[key]) || legacyOffset, 0), 100000);
      return result;
    }, {});
    if (Number.isNaN(since.getTime()) || since.getTime() > now.getTime() + 300000) {
      throw businessError("INVALID_SYNC_CURSOR", "同步位置已失效，请刷新页面");
    }
    const visibleRecords = _.and(
      { coupleId: couple._id, updatedAt: _.gt(since) },
      _.or(
        { visibility: "couple" },
        { ownerOpenid: openid },
        { creatorOpenid: openid },
        { visibility: _.exists(false) }
      )
    );
    const [recordsResult, plansResult, notificationsResult] = await Promise.all([
      db.collection("records").where(visibleRecords).orderBy("updatedAt", "asc").skip(offsets.records).limit(101).get(),
      db.collection("plans").where({ coupleId: couple._id, updatedAt: _.gt(since) }).orderBy("updatedAt", "asc").skip(offsets.plans).limit(101).get(),
      db.collection("notifications").where({ coupleId: couple._id, recipientOpenid: openid, updatedAt: _.gt(since) }).orderBy("updatedAt", "asc").skip(offsets.notifications).limit(101).get()
    ]);
    const pages = {
      records: recordsResult.data.slice(0, 100),
      plans: plansResult.data.slice(0, 100),
      notifications: notificationsResult.data.slice(0, 100)
    };
    const hasMoreByType = {
      records: recordsResult.data.length > 100,
      plans: plansResult.data.length > 100,
      notifications: notificationsResult.data.length > 100
    };
    const hasMore = Object.values(hasMoreByType).some(Boolean);
    const nextOffsets = {
      records: offsets.records + pages.records.length,
      plans: offsets.plans + pages.plans.length,
      notifications: offsets.notifications + pages.notifications.length
    };
    return success({
      changes: {
        records: pages.records.filter((record) => canReadRecord(record, openid)),
        plans: pages.plans,
        notifications: pages.notifications
      },
      cursor: hasMore ? since.toISOString() : now.toISOString(),
      hasMore,
      hasMoreByType,
      nextOffsets
    });
  }

  if (action === "export") {
    const base = await loadBase(couple, openid, 501, 501);
    const albums = await db.collection("albums").where({ coupleId: couple._id, deletedAt: null }).limit(101).get();
    const assets = await db.collection("media_assets").where({ coupleId: couple._id, deletedAt: null }).limit(501).get();
    const activeAlbums = albums.data.filter((album) => !album.deletedAt);
    const activeAssets = assets.data.filter((asset) => !asset.deletedAt);
    return success({
      exportData: {
        schemaVersion: 1,
        exportedAt: new Date(),
        couple: { _id: couple._id, spaceName: couple.spaceName, anniversaryDate: couple.anniversaryDate, members: couple.members },
        records: base.records.slice(0, 500),
        plans: base.plans.slice(0, 500),
        wallets: base.wallets,
        albums: activeAlbums.slice(0, 100),
        mediaAssets: activeAssets.slice(0, 500).map(({ fileID, ...asset }) => ({ ...asset, fileID })),
        truncated: {
          records: base.records.length > 500,
          plans: base.plans.length > 500,
          albums: activeAlbums.length > 100,
          mediaAssets: activeAssets.length > 500
        }
      }
    });
  }

  if (action === "import") {
    const backup = event.backup;
    const recovery = validateBackupEnvelope(backup, couple._id);
    const now = new Date();
    const counts = { records: 0, plans: 0, skipped: 0 };
    for (const source of recovery.records) {
      if (!source._id || await alreadyRestored("records", couple._id, source._id)) { counts.skipped += 1; continue; }
      const type = safeText(source.type, 30);
      if (!type) { counts.skipped += 1; continue; }
      await db.collection("records").add({ data: {
        coupleId: couple._id, type,
        visibility: source.visibility === "private" ? "private" : "couple",
        ownerOpenid: openid, creatorOpenid: openid,
        title: safeText(source.title, 100), content: safeText(source.content, 10000),
        startAt: source.startAt ? new Date(source.startAt) : null,
        endAt: source.endAt ? new Date(source.endAt) : null,
        metrics: source.metrics && typeof source.metrics === "object" ? source.metrics : {},
        payload: source.payload && typeof source.payload === "object" ? source.payload : {},
        version: 1, restoredFromId: source._id, createdAt: now, updatedAt: now, deletedAt: null
      } });
      counts.records += 1;
    }
    for (const source of recovery.plans) {
      if (!source._id || await alreadyRestored("plans", couple._id, source._id)) { counts.skipped += 1; continue; }
      const type = safeText(source.type, 30);
      if (!type || !safeText(source.title, 80)) { counts.skipped += 1; continue; }
      await db.collection("plans").add({ data: {
        coupleId: couple._id, type, title: safeText(source.title, 80), detail: safeText(source.detail, 5000),
        status: ["todo", "doing", "done", "archived"].includes(source.status) ? source.status : "todo",
        assigneeOpenids: Array.isArray(source.assigneeOpenids) ? source.assigneeOpenids.filter((id) => couple.members.includes(id)) : [],
        startAt: source.startAt ? new Date(source.startAt) : null,
        endAt: source.endAt ? new Date(source.endAt) : null,
        rewardPoints: Math.min(Math.max(Number(source.rewardPoints) || 0, 0), 100000),
        payload: source.payload && typeof source.payload === "object" ? source.payload : {},
        version: 1, createdBy: openid, restoredFromId: source._id, createdAt: now, updatedAt: now, deletedAt: null
      } });
      counts.plans += 1;
    }
    return success({ counts });
  }

  if (action === "health") {
    return success({ modules: ["login", "couple", "records", "plans", "rewards", "media", "dashboard", "notifications"], serverTime: new Date() });
  }

  throw businessError("UNKNOWN_ACTION", "暂不支持这个操作");
}

exports.main = async (event = {}) => {
  const startedAt = Date.now();
  const { OPENID } = cloud.getWXContext();
  try {
    const result = await handle(event, OPENID);
    console.info("dashboard function completed", { traceId: event._traceId || "", action: event.action || "", code: "OK", durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    console.error("dashboard function failed", { traceId: event._traceId || "", action: event.action, code: error.code || error.message, durationMs: Date.now() - startedAt });
    return failure(error);
  }
};
