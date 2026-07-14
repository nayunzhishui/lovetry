const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
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

function success(data) {
  return { ok: true, data, ...data };
}

function failure(error) {
  const code = error.code || error.message || "INTERNAL_ERROR";
  const known = Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code);
  return { ok: false, error: { code: known ? code : "INTERNAL_ERROR", message: known ? (error.message || ERROR_MESSAGES[code]) : "服务暂时不可用" } };
}

async function findMine(openid) {
  const result = await db
    .collection("couples")
    .where({ members: openid, status: _.neq("archived") })
    .limit(1)
    .get();
  return result.data[0] || null;
}

async function getAlbum(id, couple) {
  if (!id) throw businessError("ALBUM_NOT_FOUND");
  try {
    const result = await db.collection("albums").doc(id).get();
    if (!result.data || result.data.coupleId !== couple._id || result.data.deletedAt) {
      throw businessError("ALBUM_NOT_FOUND");
    }
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
    if (!result.data || result.data.coupleId !== couple._id || result.data.deletedAt) {
      throw businessError("ASSET_NOT_FOUND");
    }
    return result.data;
  } catch (error) {
    if (error.code) throw error;
    throw businessError("ASSET_NOT_FOUND");
  }
}

async function handle(event, openid) {
  const couple = await findMine(openid);
  if (!couple) throw businessError("COUPLE_REQUIRED");
  const action = event.action;

  if (action === "createAlbum") {
    const title = String(event.album?.title || "").trim().slice(0, 60);
    if (!title) throw businessError("INVALID_ALBUM");
    const now = new Date();
    const data = {
      coupleId: couple._id,
      title,
      description: String(event.album?.description || "").trim().slice(0, 500),
      coverAssetId: "",
      createdBy: openid,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    const result = await db.collection("albums").add({ data });
    return success({ album: { _id: result._id, ...data } });
  }

  if (action === "listAlbums") {
    const result = await db
      .collection("albums")
      .where({ coupleId: couple._id, deletedAt: null })
      .orderBy("updatedAt", "desc")
      .limit(50)
      .get();
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
    const next = {
      title,
      description: String(event.album?.description ?? current.description ?? "").trim().slice(0, 500),
      coverAssetId,
      updatedAt,
      version: _.inc(1)
    };
    await db.collection("albums").doc(current._id).update({ data: next });
    return success({ album: { ...current, ...next, version: Number(current.version || 1) + 1 } });
  }

  if (action === "deleteAlbum") {
    const current = await getAlbum(event.albumId, couple);
    const assets = await db.collection("media_assets").where({ coupleId: couple._id, albumId: current._id, deletedAt: null }).limit(1).get();
    if (assets.data.some((asset) => !asset.deletedAt)) {
      throw businessError("ALBUM_NOT_EMPTY", "请先删除相册中的照片");
    }
    const deletedAt = new Date();
    await db.collection("albums").doc(current._id).update({ data: { deletedAt, updatedAt: deletedAt, version: _.inc(1) } });
    return success({ albumId: current._id, deletedAt });
  }

  if (action === "addAsset") {
    const album = await getAlbum(event.asset?.albumId, couple);
    const fileID = String(event.asset?.fileID || "").trim();
    const cloudPath = String(event.asset?.cloudPath || "").replace(/^\/+/, "").slice(0, 500);
    const expectedPrefix = `couples/${couple._id}/${openid}/`;
    if (!fileID.startsWith("cloud://") || !cloudPath.startsWith(expectedPrefix) || !fileID.endsWith(cloudPath)) {
      throw businessError("INVALID_ASSET");
    }
    const now = new Date();
    const data = {
      coupleId: couple._id,
      albumId: album._id,
      fileID,
      cloudPath,
      description: String(event.asset?.description || "").trim().slice(0, 500),
      mimeType: String(event.asset?.mimeType || "image/jpeg").slice(0, 80),
      size: Math.max(Number(event.asset?.size) || 0, 0),
      width: Math.max(Number(event.asset?.width) || 0, 0),
      height: Math.max(Number(event.asset?.height) || 0, 0),
      relatedRecordId: String(event.asset?.relatedRecordId || "").slice(0, 80),
      relatedPlanId: String(event.asset?.relatedPlanId || "").slice(0, 80),
      ownerOpenid: openid,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      pendingDeletion: false
    };
    const result = await db.collection("media_assets").add({ data });
    await db.collection("albums").doc(album._id).update({ data: { updatedAt: now, version: _.inc(1) } });
    return success({ asset: { _id: result._id, ...data } });
  }

  if (action === "listAssets") {
    const album = await getAlbum(event.albumId, couple);
    const limit = Math.min(Math.max(Number(event.limit) || 30, 1), 50);
    const offset = Math.max(Number(event.offset) || 0, 0);
    const result = await db
      .collection("media_assets")
      .where({ coupleId: couple._id, albumId: album._id, deletedAt: null })
      .orderBy("createdAt", "desc")
      .skip(offset)
      .limit(limit + 1)
      .get();
    const assets = result.data.filter((asset) => !asset.deletedAt);
    return success({ assets: assets.slice(0, limit), page: { offset, limit, hasMore: result.data.length > limit } });
  }

  if (action === "deleteAsset") {
    const asset = await getAsset(event.assetId, couple);
    const deletedAt = new Date();
    let pendingDeletion = false;
    try {
      await cloud.deleteFile({ fileList: [asset.fileID] });
    } catch (error) {
      pendingDeletion = true;
      console.error("cloud file delete failed", { assetId: asset._id, code: error.errCode || error.message });
    }
    await db.collection("media_assets").doc(asset._id).update({
      data: { deletedAt, updatedAt: deletedAt, pendingDeletion }
    });
    return success({ assetId: asset._id, deletedAt, pendingDeletion });
  }

  throw businessError("UNKNOWN_ACTION");
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  try {
    return await handle(event, OPENID);
  } catch (error) {
    console.error("media function failed", { action: event.action, code: error.code || error.message });
    return failure(error);
  }
};
