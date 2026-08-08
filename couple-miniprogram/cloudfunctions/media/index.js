process.env.TZ = "Asia/Shanghai";
const cloud = require("wx-server-sdk");
const { resolveActiveCouple } = require("./membership");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const findMine = (openid) => resolveActiveCouple(db, _, openid);
const ERROR_MESSAGES = {
  COUPLE_REQUIRED: "请先创建或加入情侣空间",
  INVALID_ALBUM: "相册名称不能为空",
  INVALID_ASSET: "图片信息不正确",
  ALBUM_NOT_FOUND: "相册不存在或已删除",
  ASSET_NOT_FOUND: "图片不存在或已删除",
  ALBUM_NOT_EMPTY: "请先删除相册中的照片",
  NO_PERMISSION: "无权访问这个相册",
  UNKNOWN_ACTION: "暂不支持这个操作"
};

function businessError(code, message) {
  const error = new Error(message || ERROR_MESSAGES[code] || "操作失败");
  error.code = code;
  return error;
}
function success(data) { return { ok: true, data, ...data }; }
function failure(error) {
  const code = error.code || error.message || "INTERNAL_ERROR";
  const known = Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code);
  return { ok: false, error: { code: known ? code : "INTERNAL_ERROR", message: known ? (error.message || ERROR_MESSAGES[code]) : "服务暂时不可用" } };
}

async function getAlbum(id, couple) {
  if (!id) throw businessError("ALBUM_NOT_FOUND");
  try {
    const result = await db.collection("albums").doc(id).get();
    if (!result.data || result.data.coupleId !== couple._id || result.data.deletedAt) throw businessError("ALBUM_NOT_FOUND");
    return result.data;
  } catch (error) {
    if (error.code) throw error;
    throw businessError("ALBUM_NOT_FOUND");
  }
}

async function getAsset(id, couple) {
  if (!id) throw businessError("ASSET_NOT_FOUND");
  try {
    const result = await db.collection("media_assets").doc(id).get();
    if (!result.data || result.data.coupleId !== couple._id || result.data.deletedAt) throw businessError("ASSET_NOT_FOUND");
    return result.data;
  } catch (error) {
    if (error.code) throw error;
    throw businessError("ASSET_NOT_FOUND");
  }
}

async function tryDeleteFiles(fileList) {
  try {
    const result = await cloud.deleteFile({ fileList });
    // deleteFile 单文件失败不会 reject，而是在返回值 fileList[i].status 中体现（0 为成功）。
    const items = (result && result.fileList) || [];
    const failed = items.filter((item) => Number(item.status || 0) !== 0);
    if (failed.length) {
      console.error("cloud file delete partially failed", { failed: failed.map((item) => ({ fileID: item.fileID, status: item.status })) });
      return false;
    }
    return true;
  } catch (error) {
    console.error("cloud file delete failed", { code: error.errCode || error.message });
    return false;
  }
}

// 定时触发器入口：跨空间清理删除失败残留的云文件（每日一次即可）。
async function purgeAllPendingDeletions() {
  const result = await db
    .collection("media_assets")
    .where({ pendingDeletion: true })
    .limit(50)
    .get();
  let purged = 0;
  for (const asset of result.data) {
    const ok = await tryDeleteFiles([asset.fileID]);
    if (ok) {
      await db.collection("media_assets").doc(asset._id).update({ data: { pendingDeletion: false, updatedAt: new Date() } });
      purged += 1;
    }
  }
  console.info("media purgePendingDeletions", { scanned: result.data.length, purged });
  return { scanned: result.data.length, purged };
}

async function handle(event, openid) {
  const couple = await findMine(openid);
  if (!couple) throw businessError("COUPLE_REQUIRED");
  const action = event.action;

  if (action === "createAlbum") {
    const title = String(event.album?.title || "").trim().slice(0, 60);
    if (!title) throw businessError("INVALID_ALBUM");
    const now = new Date();
    const data = { coupleId: couple._id, title, description: String(event.album?.description || "").trim().slice(0, 500), coverAssetId: "", createdBy: openid, version: 1, createdAt: now, updatedAt: now, deletedAt: null };
    const result = await db.collection("albums").add({ data });
    return success({ album: { _id: result._id, ...data } });
  }

  if (action === "listAlbums") {
    const result = await db.collection("albums").where({ coupleId: couple._id, deletedAt: null }).orderBy("updatedAt", "desc").limit(50).get();
    return success({ albums: result.data.filter((album) => !album.deletedAt) });
  }

  if (action === "updateAlbum") {
    const current = await getAlbum(event.albumId, couple);
    const title = String(event.album?.title || current.title).trim().slice(0, 60);
    if (!title) throw businessError("INVALID_ALBUM");
    const updatedAt = new Date();
    const coverAssetId = String(event.album?.coverAssetId ?? current.coverAssetId ?? "").slice(0, 80);
    if (coverAssetId) {
      const cover = await getAsset(coverAssetId, couple);
      if (cover.albumId !== current._id) throw businessError("INVALID_ASSET");
    }
    const next = { title, description: String(event.album?.description ?? current.description ?? "").trim().slice(0, 500), coverAssetId, updatedAt, version: _.inc(1) };
    await db.collection("albums").doc(current._id).update({ data: next });
    return success({ album: { ...current, ...next, version: Number(current.version || 1) + 1 } });
  }

  if (action === "deleteAlbum") {
    const current = await getAlbum(event.albumId, couple);
    const assets = await db.collection("media_assets").where({ coupleId: couple._id, albumId: current._id, deletedAt: null }).limit(1).get();
    if (assets.data.some((asset) => !asset.deletedAt)) throw businessError("ALBUM_NOT_EMPTY", "请先删除相册中的照片");
    const deletedAt = new Date();
    await db.collection("albums").doc(current._id).update({ data: { deletedAt, updatedAt: deletedAt, version: _.inc(1) } });
    return success({ albumId: current._id, deletedAt });
  }

  if (action === "addAsset") {
    const album = await getAlbum(event.asset?.albumId, couple);
    const fileID = String(event.asset?.fileID || "").trim();
    const cloudPath = String(event.asset?.cloudPath || "").replace(/^\/+/, "").slice(0, 500);
    const expectedPrefix = `couples/${couple._id}/${openid}/`;
    if (!fileID.startsWith("cloud://") || !cloudPath.startsWith(expectedPrefix) || !fileID.endsWith(cloudPath)) throw businessError("INVALID_ASSET");
    const now = new Date();
    const data = {
      coupleId: couple._id, albumId: album._id, fileID, cloudPath,
      description: String(event.asset?.description || "").trim().slice(0, 500),
      mimeType: String(event.asset?.mimeType || "image/jpeg").slice(0, 80),
      size: Math.max(Number(event.asset?.size) || 0, 0), width: Math.max(Number(event.asset?.width) || 0, 0), height: Math.max(Number(event.asset?.height) || 0, 0),
      relatedRecordId: String(event.asset?.relatedRecordId || "").slice(0, 80), relatedPlanId: String(event.asset?.relatedPlanId || "").slice(0, 80),
      ownerOpenid: openid, createdAt: now, updatedAt: now, deletedAt: null, pendingDeletion: false
    };
    const result = await db.collection("media_assets").add({ data });
    await db.collection("albums").doc(album._id).update({ data: { updatedAt: now, version: _.inc(1) } });
    return success({ asset: { _id: result._id, ...data } });
  }

  if (action === "listAssets") {
    const album = await getAlbum(event.albumId, couple);
    const limit = Math.min(Math.max(Number(event.limit) || 30, 1), 50);
    const offset = Math.max(Number(event.offset) || 0, 0);
    const result = await db.collection("media_assets").where({ coupleId: couple._id, albumId: album._id, deletedAt: null }).orderBy("createdAt", "desc").skip(offset).limit(limit + 1).get();
    const assets = result.data.filter((asset) => !asset.deletedAt);
    return success({ assets: assets.slice(0, limit), page: { offset, limit, hasMore: result.data.length > limit } });
  }

  if (action === "deleteAsset") {
    const asset = await getAsset(event.assetId, couple);
    const deletedAt = new Date();
    // 先软删数据库记录（用户视角立即消失），再删云文件；
    // 文件删除失败或逐文件返回码非 0 时标记 pendingDeletion，由 purgePendingDeletions 兜底重试。
    await db.collection("media_assets").doc(asset._id).update({
      data: { deletedAt, updatedAt: deletedAt, pendingDeletion: true }
    });
    const pendingDeletion = !(await tryDeleteFiles([asset.fileID]));
    if (!pendingDeletion) {
      await db.collection("media_assets").doc(asset._id).update({ data: { pendingDeletion: false } });
    }
    return success({ assetId: asset._id, deletedAt, pendingDeletion });
  }

  if (action === "purgePendingDeletions") {
    // 仅清理本空间内删除失败残留的云文件；全局兜底由定时触发器走 purgeAllPendingDeletions。
    const result = await db
      .collection("media_assets")
      .where({ coupleId: couple._id, pendingDeletion: true })
      .limit(50)
      .get();
    let purged = 0;
    for (const asset of result.data) {
      const ok = await tryDeleteFiles([asset.fileID]);
      if (ok) {
        await db.collection("media_assets").doc(asset._id).update({ data: { pendingDeletion: false, updatedAt: new Date() } });
        purged += 1;
      }
    }
    return success({ scanned: result.data.length, purged });
  }

  throw businessError("UNKNOWN_ACTION");
}

exports.main = async (event = {}) => {
  const startedAt = Date.now();
  const { OPENID } = cloud.getWXContext();
  // 定时触发器（无用户上下文）：执行全局 pendingDeletion 清理。
  const isScheduledEvent = !OPENID && event && event.Type && event.Time;
  if (isScheduledEvent || (!OPENID && event.TriggerName)) {
    try {
      return { ok: true, data: await purgeAllPendingDeletions() };
    } catch (error) {
      console.error("media timer purge failed", { code: error.code || error.message });
      return { ok: false };
    }
  }
  try {
    const result = await handle(event, OPENID);
    console.info("media function completed", { traceId: event._traceId || "", action: event.action || "", code: "OK", durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    console.error("media function failed", { traceId: event._traceId || "", action: event.action, code: error.code || error.message, durationMs: Date.now() - startedAt });
    return failure(error);
  }
};

exports.cleanupPendingDeletion = purgeAllPendingDeletions;
