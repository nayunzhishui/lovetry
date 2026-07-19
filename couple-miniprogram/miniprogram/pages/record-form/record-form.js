const cloudApi = require("../../services/cloudApi");
const formDraft = require("../../services/formDraft");
const agentHandoff = require("../../services/agentHandoff");
const { applyFormTemplate, templatesFor } = require("../../shared/form-assist");
const { handoffToConflictPatch } = require("../../shared/agent-context");

const TYPES = [
  { value: "moment", label: "生活日记" },
  { value: "mood", label: "心情日记" },
  { value: "conflict", label: "沟通复盘" },
  { value: "outing", label: "玩乐记录" },
  { value: "sleep", label: "睡眠记录" },
  { value: "period", label: "生理期记录" },
  { value: "intimacy", label: "亲密记录" },
  { value: "game", label: "游戏记录" }
];

const TYPE_META = {
  moment: { contentLabel: "今天想写下什么", placeholder: "写下一件想共同记住的小事", visibility: "couple" },
  mood: { contentLabel: "今天想写下什么", placeholder: "写下感受、缘由，或一个想记住的瞬间", visibility: "private" },
  conflict: { contentLabel: "发生了什么", placeholder: "尽量描述可观察的事实，少写对彼此的评价", visibility: "private" },
  outing: { contentLabel: "这次经历", placeholder: "吃了什么、去了哪里，发生了哪些值得记住的事", visibility: "couple" },
  sleep: { contentLabel: "睡眠备注", placeholder: "入睡感受、夜间醒来或醒后状态", visibility: "private" },
  period: { contentLabel: "身体记录", placeholder: "可选填身体感受或需要留意的事情", visibility: "private" },
  intimacy: { contentLabel: "想记下的感受", placeholder: "只写你愿意保存的内容，也可以留空", visibility: "private" },
  game: { contentLabel: "游戏备注", placeholder: "一起玩的趣事、进度或下一次计划", visibility: "couple" }
};

const DEFAULT_TITLES = {
  moment: "生活日记",
  mood: "今日心情",
  conflict: "一次沟通复盘",
  outing: "一起出去玩",
  sleep: "睡眠记录",
  period: "生理期记录",
  intimacy: "亲密记录",
  game: "游戏记录"
};

const DRAFT_FIELDS = [
  "title", "content", "visibility", "startDate", "startTime", "endDate", "endTime",
  "moodLevel", "tagsText", "feelings", "needs", "communication", "agreement",
  "satisfaction", "outingCategoryIndex", "location", "amount", "outingRating",
  "sleepQuality", "periodFlowIndex", "protectionIndex", "comfortIndex", "participants", "repairIndex"
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function toParts(value, fallback) {
  const parsed = value ? new Date(value) : fallback;
  const date = parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

function toLocalDate(date, time) {
  const value = new Date(`${date}T${time || "00:00"}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function durationMinutes(start, end) {
  if (!start || !end || end <= start) return 0;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function durationLabel(minutes) {
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分钟`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function typeIndex(type) {
  const index = TYPES.findIndex((item) => item.value === type);
  return index < 0 ? 0 : index;
}

function splitTags(value) {
  return String(value || "")
    .split(/[，,、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function emptyRecordFields() {
  return {
    title: "", content: "", moodLevel: 3, tagsText: "", feelings: "", needs: "",
    communication: "", agreement: "", satisfaction: 5, outingCategoryIndex: 0,
    location: "", amount: "", outingRating: 3, sleepQuality: 3, periodFlowIndex: 1,
    protectionIndex: 0, comfortIndex: 0, repairIndex: 0,
    participants: "", originalPayload: {}
  };
}

Page({
  data: {
    typeOptions: TYPES,
    typeIndex: 0,
    type: "mood",
    typeLabel: TYPES[0].label,
    contentLabel: TYPE_META.mood.contentLabel,
    contentPlaceholder: TYPE_META.mood.placeholder,
    recordId: "",
    version: 0,
    title: "",
    content: "",
    visibility: "private",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    moodLevel: 3,
    tagsText: "",
    feelings: "",
    needs: "",
    communication: "",
    agreement: "",
    satisfaction: 5,
    repairChoices: ["先记录下来", "准备沟通", "已经沟通", "稍后再谈"],
    repairValues: ["noted", "preparing", "talked", "later"],
    repairIndex: 0,
    outingCategories: ["吃饭", "约会", "旅行", "酒店", "其他"],
    outingCategoryIndex: 0,
    location: "",
    amount: "",
    outingRating: 3,
    sleepQuality: 3,
    periodFlows: ["少量", "正常", "较多", "结束"],
    periodFlowIndex: 1,
    protectionChoices: ["不记录", "已采取", "未采取"],
    protectionIndex: 0,
    comfortChoices: ["不记录", "舒适", "一般", "不适"],
    comfortIndex: 0,
    participants: "",
    durationText: "",
    isLoading: false,
    isSubmitting: false,
    error: "",
    originalPayload: {},
    templates: templatesFor("record", "mood"),
    draftRestored: false,
    draftStatusText: "",
    agentSuggestion: null
  },

  onLoad(options) {
    const now = new Date();
    const later = new Date(now.getTime() + 60 * 60 * 1000);
    const start = toParts(null, now);
    const end = toParts(null, later);
    const requestedType = TYPES.some((item) => item.value === options.type) ? options.type : "mood";
    const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(options.date || "")) ? options.date : "";
    this.setData({
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time
    });
    this.applyType(requestedType, true);
    if (options.id) {
      this.setData({ recordId: options.id });
      this.loadRecord(options.id);
    } else {
      this.restoreDraft();
      if (requestedType === "conflict" && options.source === "agent") {
        this.setData({ agentSuggestion: agentHandoff.load() });
      }
      if (requestedDate) this.setData({ startDate: requestedDate, endDate: requestedDate });
    }
  },

  onUnload() {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    if (this.draftDirty && !this.draftCommitted) this.persistDraft();
  },

  applyType(type, resetVisibility) {
    const index = typeIndex(type);
    const meta = TYPE_META[type];
    const next = {
      type,
      typeIndex: index,
      typeLabel: TYPES[index].label,
      contentLabel: meta.contentLabel,
      contentPlaceholder: meta.placeholder,
      templates: templatesFor("record", type),
      draftRestored: false,
      draftStatusText: ""
    };
    if (resetVisibility) next.visibility = meta.visibility;
    this.setData(next);
    this.updateDuration();
  },

  onTypeChange(event) {
    if (this.data.recordId) return;
    const item = TYPES[Number(event.detail.value)] || TYPES[0];
    if (this.draftDirty) this.persistDraft();
    this.setData(emptyRecordFields());
    this.applyType(item.value, true);
    this.restoreDraft();
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value });
    this.scheduleDraftSave();
  },

  onNumberInput(event) {
    this.setData({ [event.currentTarget.dataset.key]: Number(event.detail.value) || 0 });
    this.scheduleDraftSave();
  },

  onPickerChange(event) {
    this.setData({ [event.currentTarget.dataset.key]: Number(event.detail.value) });
    this.scheduleDraftSave();
  },

  onDateTimeChange(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value });
    this.updateDuration();
    this.scheduleDraftSave();
  },

  selectVisibility(event) {
    this.setData({ visibility: event.currentTarget.dataset.value });
    this.scheduleDraftSave();
  },

  draftScope() {
    return `record:${this.data.recordId || "new"}:${this.data.type}`;
  },

  scheduleDraftSave() {
    this.draftDirty = true;
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.setData({ draftStatusText: "正在保留草稿…" });
    this.draftTimer = setTimeout(() => this.persistDraft(), 450);
  },

  persistDraft() {
    if (this.draftCommitted) return;
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    const data = DRAFT_FIELDS.reduce((result, field) => ({ ...result, [field]: this.data[field] }), {});
    const saved = formDraft.save(this.draftScope(), data);
    this.draftDirty = false;
    this.setData({ draftStatusText: saved ? "草稿已保存在本机" : "本机草稿暂未保存" });
  },

  restoreDraft() {
    const saved = formDraft.load(this.draftScope());
    if (!saved) return;
    const data = DRAFT_FIELDS.reduce((result, field) => {
      if (Object.prototype.hasOwnProperty.call(saved.data, field)) result[field] = saved.data[field];
      return result;
    }, {});
    this.setData({ ...data, draftRestored: true, draftStatusText: "已恢复上次未完成内容" });
    this.updateDuration();
  },

  clearDraftBackup() {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    formDraft.clear(this.draftScope());
    this.draftDirty = false;
    this.setData({ draftRestored: false, draftStatusText: "已移除本机草稿备份" });
  },

  importAgentSuggestion() {
    const patch = handoffToConflictPatch(this.data.agentSuggestion);
    if (!patch) return;
    const append = (current, incoming) => [String(current || "").trim(), incoming].filter(Boolean).join("\n\n");
    this.setData({
      title: this.data.title || patch.title,
      content: append(this.data.content, patch.content),
      communication: append(this.data.communication, patch.communication),
      visibility: "private",
      agentSuggestion: null,
      draftStatusText: "AI 建议已加入私密草稿，请核对并改成自己的话"
    });
    agentHandoff.clear();
    this.scheduleDraftSave();
  },

  dismissAgentSuggestion() {
    agentHandoff.clear();
    this.setData({ agentSuggestion: null });
  },

  applyTemplate(event) {
    const next = applyFormTemplate({}, this.data.templates, event.currentTarget.dataset.id);
    if (!Object.keys(next).length) return;
    this.setData(next);
    this.scheduleDraftSave();
    wx.showToast({ title: "模板已填入，可继续修改", icon: "none" });
  },

  updateDuration() {
    if (this.data.type !== "sleep" && this.data.type !== "game") {
      this.setData({ durationText: "" });
      return;
    }
    const start = toLocalDate(this.data.startDate, this.data.startTime);
    const end = toLocalDate(this.data.endDate, this.data.endTime);
    this.setData({ durationText: durationLabel(durationMinutes(start, end)) });
  },

  loadRecord(recordId) {
    this.setData({ isLoading: true, error: "" });
    cloudApi
      .getRecord(recordId)
      .then((record) => {
        if (!record) throw new Error("记录不存在");
        const payload = record.payload || {};
        const start = toParts(record.startAt || record.createdAt, new Date());
        const end = toParts(record.endAt || record.startAt || record.createdAt, new Date());
        const outingCategoryIndex = Math.max(
          0,
          this.data.outingCategories.indexOf(payload.category)
        );
        const periodFlowIndex = Math.max(0, this.data.periodFlows.indexOf(payload.flow));
        const protectionIndex = Math.max(0, this.data.protectionChoices.indexOf(payload.protection));
        const comfortIndex = Math.max(0, this.data.comfortChoices.indexOf(payload.comfort));
        const repairIndex = Math.max(0, this.data.repairValues.indexOf(payload.repairStatus));
        this.setData({
          version: Number(record.version || 1),
          title: record.title || "",
          content: record.content || "",
          visibility: record.visibility || TYPE_META[record.type].visibility,
          startDate: start.date,
          startTime: start.time,
          endDate: end.date,
          endTime: end.time,
          moodLevel: Number(payload.level || 3),
          tagsText: Array.isArray(payload.tags) ? payload.tags.join("，") : payload.tags || "",
          feelings: payload.feelings || "",
          needs: payload.needs || "",
          communication: payload.communication || "",
          agreement: payload.agreement || payload.result || "",
          satisfaction: Number(payload.satisfaction || 5),
          outingCategoryIndex,
          location: payload.location || "",
          amount: payload.amount === undefined ? "" : String(payload.amount),
          outingRating: Number(payload.rating || 3),
          sleepQuality: Number(payload.quality || 3),
          periodFlowIndex,
          protectionIndex,
          comfortIndex,
          repairIndex,
          participants: payload.participants || "",
          originalPayload: payload
        });
        this.applyType(record.type, false);
        this.restoreDraft();
      })
      .catch((error) => {
        this.setData({ error: cloudApi.getErrorMessage(error, "记录加载失败，请返回后重试") });
      })
      .finally(() => this.setData({ isLoading: false }));
  },

  buildRecord() {
    const type = this.data.type;
    const startAt = toLocalDate(
      this.data.startDate,
      this.data.type === "period" ? "00:00" : this.data.startTime
    );
    let endAt = null;
    let metrics = {};
    let payload = {};

    if (!startAt) throw new Error("请检查记录时间");

    if (type === "moment") {
      payload = { ...this.data.originalPayload };
    } else if (type === "mood") {
      payload = { level: Number(this.data.moodLevel), tags: splitTags(this.data.tagsText) };
    } else if (type === "conflict") {
      payload = {
        ...this.data.originalPayload,
        feelings: this.data.feelings.trim(),
        needs: this.data.needs.trim(),
        communication: this.data.communication.trim(),
        agreement: this.data.agreement.trim(),
        satisfaction: Number(this.data.satisfaction),
        repairStatus: this.data.repairValues[this.data.repairIndex]
      };
    } else if (type === "outing") {
      payload = {
        category: this.data.outingCategories[this.data.outingCategoryIndex],
        location: this.data.location.trim(),
        amount: this.data.amount === "" ? null : Number(this.data.amount),
        rating: Number(this.data.outingRating)
      };
      if (this.data.amount !== "" && (!Number.isFinite(payload.amount) || payload.amount < 0)) {
        throw new Error("金额应为不小于 0 的数字");
      }
    } else if (type === "sleep" || type === "game") {
      endAt = toLocalDate(this.data.endDate, this.data.endTime);
      const minutes = durationMinutes(startAt, endAt);
      if (!minutes) throw new Error("结束时间应晚于开始时间，跨天时请选择第二天日期");
      metrics = { durationMinutes: minutes };
      payload = type === "sleep"
        ? { quality: Number(this.data.sleepQuality) }
        : { participants: this.data.participants.trim() };
    } else if (type === "period") {
      endAt = toLocalDate(this.data.endDate, "23:59");
      if (!endAt || endAt < startAt) throw new Error("结束日期不能早于开始日期");
      payload = { flow: this.data.periodFlows[this.data.periodFlowIndex] };
    } else if (type === "intimacy") {
      payload = {
        protection: this.data.protectionChoices[this.data.protectionIndex],
        comfort: this.data.comfortChoices[this.data.comfortIndex]
      };
    }

    return {
      type,
      title: this.data.title.trim() || DEFAULT_TITLES[type],
      content: this.data.content.trim(),
      visibility: this.data.visibility,
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : null,
      metrics,
      payload
    };
  },

  submit() {
    if (this.data.isSubmitting || this.data.isLoading) return;
    let record;
    try {
      record = this.buildRecord();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
      return;
    }

    this.setData({ isSubmitting: true, error: "" });
    wx.showLoading({ title: "保存中", mask: true });
    const request = this.data.recordId
      ? cloudApi.updateRecord(this.data.recordId, this.data.version, record)
      : cloudApi.createRecord(record);
    request
      .then(() => {
        this.draftCommitted = true;
        if (this.draftTimer) clearTimeout(this.draftTimer);
        formDraft.clear(this.draftScope());
        wx.showToast({ title: this.data.recordId ? "修改已保存" : "记录已保存" });
        setTimeout(() => wx.navigateBack(), 450);
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "保存失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({ isSubmitting: false });
      });
  }
});
