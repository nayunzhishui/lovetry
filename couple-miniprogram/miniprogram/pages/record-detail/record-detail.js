const cloudApi = require("../../services/cloudApi");

const TYPE_LABELS = {
  moment: "共同经历",
  mood: "心情日记",
  conflict: "沟通复盘",
  outing: "玩乐记录",
  sleep: "睡眠记录",
  period: "生理期记录",
  intimacy: "亲密记录",
  game: "游戏记录",
  pomodoro: "专注记录"
};
const EDITABLE_TYPES = new Set(["mood", "conflict", "outing", "sleep", "period", "intimacy", "game"]);
const REPAIR_LABELS = { noted: "先记录下来", preparing: "准备沟通", talked: "已经沟通", later: "稍后再谈" };

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()} 年 ${pad(date.getMonth() + 1)} 月 ${pad(date.getDate())} 日 ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function minutesText(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分钟`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function row(label, value) {
  if (value === undefined || value === null || value === "") return null;
  return { label, value: String(value) };
}

function buildRows(record) {
  const payload = record.payload || {};
  const metrics = record.metrics || {};
  const rows = [];
  if (record.type === "mood") {
    rows.push(row("心情程度", payload.level ? `${payload.level} / 5` : ""));
    rows.push(row("标签", Array.isArray(payload.tags) ? payload.tags.join(" · ") : payload.tags));
  } else if (record.type === "conflict") {
    rows.push(row("我的感受", payload.feelings));
    rows.push(row("我在意的需要", payload.needs));
    rows.push(row("沟通过程", payload.communication));
    rows.push(row("共同约定", payload.agreement || payload.result));
    rows.push(row("修复进度", REPAIR_LABELS[payload.repairStatus] || payload.repairStatus));
    rows.push(row("沟通满意度", payload.satisfaction ? `${payload.satisfaction} / 10` : ""));
  } else if (record.type === "outing") {
    rows.push(row("类型", payload.category));
    rows.push(row("地点", payload.location));
    rows.push(row("共同花费", payload.amount === null || payload.amount === undefined ? "" : `¥${payload.amount}`));
  } else if (record.type === "sleep") {
    rows.push(row("睡眠质量", payload.quality ? `${payload.quality} / 5` : ""));
    rows.push(row("睡眠时长", minutesText(metrics.durationMinutes)));
  } else if (record.type === "period") {
    rows.push(row("记录状态", payload.flow));
  } else if (record.type === "intimacy") {
    rows.push(row("保护措施", payload.protection));
    rows.push(row("身体感受", payload.comfort));
  } else if (record.type === "game") {
    rows.push(row("参与人", payload.participants));
    rows.push(row("游戏时长", minutesText(metrics.durationMinutes)));
  } else if (record.type === "pomodoro") {
    rows.push(row("专注结果", metrics.completed === false ? "已中断" : "已完成"));
    rows.push(row("专注时长", minutesText(metrics.durationMinutes)));
    rows.push(row("计划时长", minutesText(metrics.plannedMinutes)));
  }
  return rows.filter(Boolean);
}

function presentRecord(record) {
  return {
    ...record,
    typeLabel: TYPE_LABELS[record.type] || "生活记录",
    visibilityLabel: record.visibility === "private" ? "仅自己可见" : "两人共享",
    startText: formatDate(record.startAt || record.createdAt),
    endText: formatDate(record.endAt),
    detailRows: buildRows(record)
  };
}

Page({
  data: {
    recordId: "",
    record: null,
    canEdit: false,
    editNote: "",
    isLoading: true,
    isDeleting: false,
    error: ""
  },

  onLoad(options) {
    this.setData({ recordId: options.id || "" });
  },

  onShow() {
    if (this.data.recordId) this.loadRecord();
    else this.setData({ isLoading: false, error: "缺少记录编号" });
  },

  loadRecord() {
    this.setData({ isLoading: true, error: "" });
    Promise.all([cloudApi.getRecord(this.data.recordId), cloudApi.login()])
      .then(([record, identity]) => {
        const openid = identity && identity.openid;
        const isOwner = Boolean(
          openid && (record.ownerOpenid === openid || record.creatorOpenid === openid)
        );
        this.setData({
          record: presentRecord(record),
          canEdit: isOwner && EDITABLE_TYPES.has(record.type),
          editNote: isOwner
            ? "这类记录暂不支持在此页面修改。"
            : "这条共享记录由伴侣创建，只有创建者可以修改或删除。"
        });
      })
      .catch((error) => {
        this.setData({
          record: null,
          error: cloudApi.getErrorMessage(error, "记录加载失败，请稍后重试")
        });
      })
      .finally(() => this.setData({ isLoading: false }));
  },

  editRecord() {
    if (!this.data.record || !this.data.canEdit) return;
    wx.navigateTo({
      url: `/pages/record-form/record-form?id=${encodeURIComponent(this.data.recordId)}`
    });
  },

  deleteRecord() {
    if (this.data.isDeleting || !this.data.canEdit) return;
    wx.showModal({
      title: "删除这条记录？",
      content: "删除后不会再出现在你们的记录中。",
      confirmText: "删除",
      confirmColor: "#a8584e",
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ isDeleting: true });
        wx.showLoading({ title: "删除中", mask: true });
        cloudApi
          .deleteRecord(this.data.recordId)
          .then(() => {
            wx.showToast({ title: "记录已删除" });
            setTimeout(() => wx.navigateBack(), 400);
          })
          .catch((error) => {
            const message = cloudApi.getErrorMessage(error, "删除失败，请稍后重试");
            this.setData({ error: message });
            wx.showToast({ title: message, icon: "none" });
          })
          .finally(() => {
            wx.hideLoading();
            this.setData({ isDeleting: false });
          });
      }
    });
  }
});
