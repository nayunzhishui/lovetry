process.env.TZ = "Asia/Shanghai";
const cloud = require("wx-server-sdk");
const { resolveArchivedCouple } = require("./archive-access");
const { validateBackupEnvelope } = require("./backup");
const { projectSyncRecords } = require("./sync-view");
const { resolveActiveCouple } = require("./membership");
const { batchEnd, normalizeRestoreJob, restoreBatchId } = require("./restore-checkpoint");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const findMine = (openid) => resolveActiveCouple(db, _, openid);
const PRIVATE_BY_DEFAULT = new Set(["mood", "conflict", "sleep", "period", "intimacy", "pomodoro"]);

// 白名单：只回传本函数自己抛出的业务错误码；未知错误一律折叠为 INTERNAL_ERROR，
// 避免把底层数据库/运行时的原始 code、message 暴露给客户端。
const ERROR_MESSAGES = {
  COUPLE_REQUIRED: "请先创建或加入情侣空间",
  INVALID_RANGE: "请选择正确的日期范围",
  INVALID_SYNC_CURSOR: "同步位置已失效，请刷新页面",
  INVALID_BACKUP: "备份格式不正确，或不属于当前情侣空间",
  TRUNCATED_BACKUP: "该备份内容不完整，请重新导出完整备份",
  UNKNOWN_ACTION: "暂不支持这个操作"
};

function success(data) {
  return { ok: true, data, ...data };
}

function failure(error) {
  const code = error.code || error.message || "INTERNAL_ERROR";
  const known = Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code);
  return {
    ok: false,
    error: {
      // businessError(code, userMessage) 的第二参数是给用户看的文案，白名单内原样透传
      code: known ? code : "INTERNAL_ERROR",
      message: known ? (error.userMessage || ERROR_MESSAGES[code]) : "服务暂时不可用"
    }
  };
}

function businessError(code, userMessage) {
  const error = new Error(code);
  error.code = code;
  error.userMessage = userMessage;
  return error;
}

function normalizeRecordVisibility(type, visibility) {
  if (visibility === "private" || visibility === "couple") return visibility;
  return PRIVATE_BY_DEFAULT.has(type) ? "private" : "couple";
}

function canReadRecord(record, openid) {
  if (record.deletedAt) return false;
  const visibility = normalizeRecordVisibility(record.type, record.visibility);
  return visibility === "couple" || record.ownerOpenid === openid || record.creatorOpenid === openid;
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

function exportRecord(record) {
  const { coupleId, ownerOpenid, creatorOpenid, requestFingerprint, clientRequestId, deletedAt, ...rest } = record;
  const payload = { ...(rest.payload || {}) };
  delete payload.reactionsByOpenid;
  return { ...rest, payload };
}

function exportPlan(plan) {
  const { coupleId, createdBy, deletedAt, ...rest } = plan;
  return rest;
}

function exportWallet(wallet, openid) {
  return {
    role: wallet.ownerOpenid === openid ? "self" : "partner",
    balance: Number(wallet.balance) || 0,
    totalEarned: Number(wallet.totalEarned) || 0,
    totalSpent: Number(wallet.totalSpent) || 0
  };
}

function exportAlbum(album) {
  const { coupleId, createdBy, deletedAt, ...rest } = album;
  return rest;
}

function exportAsset(asset) {
  const { coupleId, ownerOpenid, deletedAt, pendingDeletion, ...rest } = asset;
  return rest;
}

async function buildExportData(couple, openid, archived = false) {
  const base = await loadBase(couple, openid, 501, 501);
  const albums = await db.collection("albums").where({ coupleId: couple._id, deletedAt: null }).limit(101).get();
  const assets = await db.collection("media_assets").where({ coupleId: couple._id, deletedAt: null }).limit(501).get();
  const activeAlbums = albums.data.filter((album) => !album.deletedAt);
  const activeAssets = assets.data.filter((asset) => !asset.deletedAt);
  const wallets = archived ? base.wallets.filter((wallet) => wallet.ownerOpenid === openid) : base.wallets;
  return {
    schemaVersion: 1,
    exportedAt: new Date(),
    readOnlyArchive: archived,
    couple: {
      _id: couple._id,
      spaceName: couple.spaceName,
      anniversaryDate: couple.anniversaryDate,
      ...(archived ? { archivedAt: couple.archivedAt || couple.updatedAt || null } : {})
    },
    records: base.records.slice(0, 500).map(exportRecord),
    plans: base.plans.slice(0, 500).map(exportPlan),
    wallets: wallets.map((wallet) => exportWallet(wallet, openid)),
    albums: activeAlbums.slice(0, 100).map(exportAlbum),
    mediaAssets: activeAssets.slice(0, 500).map(exportAsset),
    truncated: {
      records: base.records.length > 500,
      plans: base.plans.length > 500,
      albums: activeAlbums.length > 100,
      mediaAssets: activeAssets.length > 500
    }
  };
}

async function handle(event, openid) {
  const action = event.action;

  if (action === "archiveExport") {
    const archivedCouple = await resolveArchivedCouple(db, openid, safeText(event.coupleId, 64));
    if (!archivedCouple) throw businessError("ARCHIVE_NOT_FOUND", "未找到可访问的历史情侣空间");
    return success({ exportData: await buildExportData(archivedCouple, openid, true) });
  }

  const couple = await findMine(openid);
  if (!couple) throw businessError("COUPLE_REQUIRED", "请先创建或加入情侣空间");

  if (action === "summary") {
    // 等待"当前用户"处理的事项：
    // a. 伴侣提议、待我确认的奖励商品（reward_items.status === "proposed" 且 createdBy 不是我）
    // b. 伴侣兑换、待我确认的仓库条目（reward_inventory.status === "pending" 且 ownerOpenid 不是我）
    // 说明：plans 没有"已完成待确认积分"的状态字段（结算与否由 reward_transactions 是否存在推导），
    // 按约定不发明字段，这里只统计 a + b。查询均带 coupleId 且用 count()，不拉取全量数据。
    // 今日一问轻查询：当日两条以内（每人最多一条回答），用嵌套字段条件直接命中
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const [base, proposedItemCount, pendingInventoryCount, dailyQuestionResult] = await Promise.all([
      loadBase(couple, openid, 100, 30),
      db.collection("reward_items")
        .where({ coupleId: couple._id, status: "proposed", createdBy: _.neq(openid) })
        .count(),
      db.collection("reward_inventory")
        .where({ coupleId: couple._id, status: "pending", ownerOpenid: _.neq(openid) })
        .count(),
      db.collection("records")
        .where({ coupleId: couple._id, "payload.dailyQuestionDate": today, deletedAt: null })
        .limit(2)
        .get()
    ]);
    const answeredBy = [...new Set(dailyQuestionResult.data
      .filter((record) => !record.deletedAt)
      .map((record) => record.ownerOpenid || record.creatorOpenid)
      .filter(Boolean))];
    const pendingApprovals = (Number(proposedItemCount.total) || 0) + (Number(pendingInventoryCount.total) || 0);
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
      pendingApprovals,
      dailyQuestion: {
        date: today,
        answeredBy,
        answeredByMe: answeredBy.includes(openid),
        answeredByPartner: answeredBy.some((member) => member !== openid)
      },
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
      .map((record) => ({
        id: record._id,
        source: "record",
        type: record.type,
        title: record.title,
        startAt: record.startAt || record.createdAt,
        endAt: record.endAt || null
      }));
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
        records: projectSyncRecords(pages.records, openid),
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
    return success({ exportData: await buildExportData(couple, openid, false) });
  }

  if (action === "import") {
    const backup = event.backup;
    const recovery = validateBackupEnvelope(backup, couple);
    const batchId = restoreBatchId(couple._id, openid, recovery);
    const jobRef = db.collection("restore_jobs").doc(batchId);
    let existing = null;
    try { existing = (await jobRef.get()).data || null; }
    catch (error) { /* first restore attempt */ }
    if (existing && (existing.coupleId !== couple._id || existing.ownerOpenid !== openid)) {
      throw businessError("INVALID_BACKUP", "恢复批次不属于当前账号或情侣空间");
    }

    let state = normalizeRestoreJob(existing, recovery);
    if (!existing) {
      const originalCount = Math.min(Array.isArray(backup.records) ? backup.records.length : 0, 500)
        + Math.min(Array.isArray(backup.plans) ? backup.plans.length : 0, 500);
      state.counts.skipped = Math.max(originalCount - recovery.records.length - recovery.plans.length, 0);
    }
    const createdAt = existing && existing.createdAt || new Date();
    const persistJob = async () => {
      state = normalizeRestoreJob(state, recovery);
      await jobRef.set({ data: {
        coupleId: couple._id,
        ownerOpenid: openid,
        batchId,
        recordIndex: state.recordIndex,
        planIndex: state.planIndex,
        counts: state.counts,
        status: state.status,
        createdAt,
        updatedAt: new Date()
      } });
    };

    const recordStop = batchEnd(state.recordIndex, recovery.records.length, 25);
    while (state.recordIndex < recordStop) {
      const source = recovery.records[state.recordIndex];
      if (!source || !source._id || await alreadyRestored("records", couple._id, source && source._id)) {
        state.counts.skipped += 1;
      } else {
        const { _id: sourceId, ...normalized } = source;
        const now = new Date();
        await db.collection("records").add({ data: {
          coupleId: couple._id,
          ...normalized,
          ownerOpenid: openid,
          creatorOpenid: openid,
          version: 1,
          restoredFromId: sourceId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null
        } });
        state.counts.records += 1;
      }
      state.recordIndex += 1;
      await persistJob();
    }

    const planStop = batchEnd(state.planIndex, recovery.plans.length, 25);
    while (state.planIndex < planStop) {
      const source = recovery.plans[state.planIndex];
      if (!source || !source._id || await alreadyRestored("plans", couple._id, source && source._id)) {
        state.counts.skipped += 1;
      } else {
        const { _id: sourceId, ...normalized } = source;
        const now = new Date();
        await db.collection("plans").add({ data: {
          coupleId: couple._id,
          ...normalized,
          createdBy: openid,
          version: 1,
          restoredFromId: sourceId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null
        } });
        state.counts.plans += 1;
      }
      state.planIndex += 1;
      await persistJob();
    }

    await persistJob();
    return success({
      counts: state.counts,
      restore: { batchId, status: state.status, hasMore: state.hasMore }
    });
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
