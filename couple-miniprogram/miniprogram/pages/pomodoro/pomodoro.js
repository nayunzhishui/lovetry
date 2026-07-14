const cloudApi = require("../../services/cloudApi");

const STORAGE_KEY = "lovetry_pomodoro_v1";
const PENDING_KEY = "lovetry_pomodoro_pending_v1";
const PHASES = {
  focus: { label: "专注", minutes: 25 },
  break: { label: "休息", minutes: 5 }
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function timerView(remainingMs, plannedMinutes) {
  const total = plannedMinutes * 60 * 1000;
  const remaining = clamp(Number(remainingMs) || 0, 0, total);
  return {
    remainingMs: remaining,
    timeText: formatClock(remaining),
    progress: Math.round(((total - remaining) / total) * 100)
  };
}

Page({
  data: {
    phase: "focus",
    phaseLabel: PHASES.focus.label,
    plannedMinutes: PHASES.focus.minutes,
    remainingMs: PHASES.focus.minutes * 60 * 1000,
    timeText: "25:00",
    progress: 0,
    status: "idle",
    statusText: "准备开始",
    focusTitle: "",
    taskOptions: [{ _id: "", title: "不关联任务" }],
    taskIndex: 0,
    startedAt: 0,
    targetAt: 0,
    isSaving: false,
    error: "",
    pendingRecord: null
  },

  onLoad() {
    if (!this.restorePendingRecord()) this.restoreState();
    this.loadTasks();
  },

  loadTasks() {
    cloudApi.listPlans({ type: "task", limit: 50 })
      .then((result) => this.setData({ taskOptions: [
        { _id: "", title: "不关联任务" },
        ...result.plans.filter((item) => item.status !== "done" && item.status !== "archived")
      ] }))
      .catch(() => {});
  },

  selectTask(event) {
    if (this.data.status !== "idle" && this.data.status !== "completed") return;
    this.setData({ taskIndex: Number(event.detail.value) });
  },

  onShow() {
    if (this.data.status === "running") {
      this.syncClock();
      this.startTicker();
    }
  },

  onHide() {
    this.stopTicker();
  },

  onUnload() {
    this.stopTicker();
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value });
    this.persistState();
  },

  selectPhase(event) {
    if (this.data.status === "running" || this.data.status === "paused" || this.data.isSaving) {
      wx.showToast({ title: "先结束当前计时", icon: "none" });
      return;
    }
    const phase = PHASES[event.currentTarget.dataset.phase] ? event.currentTarget.dataset.phase : "focus";
    const config = PHASES[phase];
    this.setData({
      phase,
      phaseLabel: config.label,
      plannedMinutes: config.minutes,
      ...timerView(config.minutes * 60 * 1000, config.minutes),
      status: "idle",
      statusText: "准备开始",
      error: "",
      pendingRecord: null
    });
    this.clearPersistedState();
  },

  start() {
    if (this.data.isSaving) return;
    if (this.data.status === "paused") {
      this.resume();
      return;
    }
    const now = Date.now();
    const remainingMs = this.data.plannedMinutes * 60 * 1000;
    this.setData({
      startedAt: now,
      targetAt: now + remainingMs,
      ...timerView(remainingMs, this.data.plannedMinutes),
      status: "running",
      statusText: `${this.data.phaseLabel}中`,
      error: "",
      pendingRecord: null
    });
    this.persistState();
    this.startTicker();
  },

  pause() {
    if (this.data.status !== "running") return;
    const remainingMs = Math.max(0, this.data.targetAt - Date.now());
    this.stopTicker();
    this.setData({
      ...timerView(remainingMs, this.data.plannedMinutes),
      status: "paused",
      statusText: "已暂停",
      targetAt: 0
    });
    this.persistState();
  },

  resume() {
    if (this.data.status !== "paused" || this.data.remainingMs <= 0) return;
    this.setData({
      targetAt: Date.now() + this.data.remainingMs,
      status: "running",
      statusText: `${this.data.phaseLabel}中`,
      error: ""
    });
    this.persistState();
    this.startTicker();
  },

  requestInterrupt() {
    if (this.data.status !== "running" && this.data.status !== "paused") return;
    wx.showModal({
      title: "中断这次计时？",
      content: "已经投入的时间仍会保存为一条中断记录。",
      confirmText: "中断",
      confirmColor: "#a8584e",
      success: (result) => {
        if (result.confirm) this.finishSession(false);
      }
    });
  },

  requestComplete() {
    if (this.data.status !== "running" && this.data.status !== "paused") return;
    wx.showModal({
      title: "现在完成？",
      content: "将按已经专注的实际时长保存。",
      confirmText: "完成",
      success: (result) => {
        if (result.confirm) this.finishSession(true);
      }
    });
  },

  startTicker() {
    this.stopTicker();
    this.ticker = setInterval(() => this.syncClock(), 500);
  },

  stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  },

  syncClock() {
    if (this.data.status !== "running") return;
    const remainingMs = Math.max(0, this.data.targetAt - Date.now());
    this.setData(timerView(remainingMs, this.data.plannedMinutes));
    if (remainingMs <= 0) {
      this.finishSession(true, true);
    }
  },

  finishSession(completed, reachedTarget) {
    if (this.data.isSaving) return;
    const plannedMs = this.data.plannedMinutes * 60 * 1000;
    const remainingMs = reachedTarget
      ? 0
      : this.data.status === "running"
        ? Math.max(0, this.data.targetAt - Date.now())
        : this.data.remainingMs;
    const elapsedMs = clamp(plannedMs - remainingMs, 1000, plannedMs);
    const endedAt = Date.now();
    this.stopTicker();
    this.clearPersistedState();

    if (this.data.phase === "break") {
      this.setData({
        ...timerView(0, this.data.plannedMinutes),
        status: "completed",
        statusText: completed ? "休息完成" : "休息已中断",
        targetAt: 0
      });
      this.clearPersistedState();
      wx.showToast({ title: completed ? "休息完成" : "休息已中断" });
      return;
    }

    const durationMinutes = Math.max(1, Math.round(elapsedMs / 60000));
    const record = {
      type: "pomodoro",
      title: this.data.focusTitle.trim() || "一次专注",
      content: completed ? "完成了一次专注。" : "这次专注提前中断。",
      visibility: "private",
      relatedPlanId: this.data.taskOptions[this.data.taskIndex]?._id || "",
      startAt: new Date(this.data.startedAt || endedAt - elapsedMs).toISOString(),
      endAt: new Date(endedAt).toISOString(),
      metrics: {
        plannedMinutes: this.data.plannedMinutes,
        durationMinutes,
        completed
      },
      payload: { phase: "focus", result: completed ? "completed" : "interrupted" }
    };
    record.clientRequestId = `pomodoro:${record.startAt}`;
    try { wx.setStorageSync(PENDING_KEY, { record, completed }); } catch (error) { /* in-memory retry remains available */ }
    this.setData({ pendingRecord: record, status: "saving", statusText: "正在保存", targetAt: 0 });
    this.saveRecord(record, completed);
  },

  saveRecord(record, completed) {
    if (this.data.isSaving) return;
    this.setData({ isSaving: true, error: "" });
    cloudApi
      .createRecord(record)
      .then(() => {
        this.setData({
          ...timerView(0, this.data.plannedMinutes),
          status: "completed",
          statusText: completed ? "专注完成" : "专注已中断",
          pendingRecord: null
        });
        this.clearPersistedState();
        this.clearPendingRecord();
        wx.showToast({ title: "专注记录已保存" });
      })
      .catch((error) => {
        this.setData({
          status: "saveFailed",
          statusText: "保存失败",
          error: cloudApi.getErrorMessage(error, "专注记录保存失败，请重试")
        });
      })
      .finally(() => this.setData({ isSaving: false }));
  },

  retrySave() {
    if (!this.data.pendingRecord || this.data.isSaving) return;
    this.saveRecord(this.data.pendingRecord, Boolean(this.data.pendingRecord.metrics.completed));
  },

  reset() {
    if (this.data.isSaving) return;
    if (this.data.status === "saveFailed" && this.data.pendingRecord) {
      wx.showModal({
        title: "放弃待保存记录？",
        content: "这次专注尚未确认写入云端。放弃后将无法在本机重试。",
        confirmText: "确认放弃",
        confirmColor: "#a8584e",
        success: (result) => { if (result.confirm) this.resetTimer(); }
      });
      return;
    }
    this.resetTimer();
  },

  resetTimer() {
    this.stopTicker();
    const config = PHASES[this.data.phase];
    this.setData({
      ...timerView(config.minutes * 60 * 1000, config.minutes),
      status: "idle",
      statusText: "准备开始",
      startedAt: 0,
      targetAt: 0,
      error: "",
      pendingRecord: null
    });
    this.clearPersistedState();
    this.clearPendingRecord();
  },

  persistState() {
    if (this.data.status !== "running" && this.data.status !== "paused") return;
    try {
      wx.setStorageSync(STORAGE_KEY, {
        phase: this.data.phase,
        plannedMinutes: this.data.plannedMinutes,
        remainingMs: this.data.remainingMs,
        status: this.data.status,
        startedAt: this.data.startedAt,
        targetAt: this.data.targetAt,
        focusTitle: this.data.focusTitle
      });
    } catch (error) {
      // Timer remains usable even if local persistence is unavailable.
    }
  },

  restoreState() {
    let saved;
    try {
      saved = wx.getStorageSync(STORAGE_KEY);
    } catch (error) {
      return;
    }
    if (!saved || !PHASES[saved.phase] || !["running", "paused"].includes(saved.status)) return;
    const config = PHASES[saved.phase];
    const remainingMs = saved.status === "running"
      ? Math.max(0, Number(saved.targetAt) - Date.now())
      : clamp(Number(saved.remainingMs) || 0, 0, config.minutes * 60 * 1000);
    this.setData({
      phase: saved.phase,
      phaseLabel: config.label,
      plannedMinutes: config.minutes,
      ...timerView(remainingMs, config.minutes),
      status: saved.status,
      statusText: saved.status === "running" ? `${config.label}中` : "已暂停",
      startedAt: Number(saved.startedAt) || Date.now(),
      targetAt: Number(saved.targetAt) || 0,
      focusTitle: saved.focusTitle || ""
    });
    if (saved.status === "running" && remainingMs <= 0) {
      this.finishSession(true, true);
    }
  },

  restorePendingRecord() {
    try {
      const pending = wx.getStorageSync(PENDING_KEY);
      if (!pending || !pending.record) return false;
      this.setData({
        pendingRecord: pending.record,
        status: "saveFailed",
        statusText: "上次记录待重试",
        error: "上次专注已结束，但云端保存尚未确认。点击重试不会重复保存。"
      });
      return true;
    } catch (error) {
      return false;
    }
  },

  clearPendingRecord() {
    try { wx.removeStorageSync(PENDING_KEY); } catch (error) { /* no-op */ }
  },

  clearPersistedState() {
    try {
      wx.removeStorageSync(STORAGE_KEY);
    } catch (error) {
      // Nothing else is required when storage cleanup fails.
    }
  }
});
