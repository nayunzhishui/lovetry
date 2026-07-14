const cloudApi = require("../../services/cloudApi");

const PLAN_TYPES = [
  { value: "task", label: "任务", eyebrow: "TO DO", titlePlaceholder: "例如：周六一起整理房间" },
  { value: "event", label: "事件", eyebrow: "EVENT", titlePlaceholder: "例如：一起看展" },
  { value: "menu", label: "菜单", eyebrow: "MENU", titlePlaceholder: "例如：巷口的砂锅" },
  { value: "trip", label: "旅行", eyebrow: "TRIP", titlePlaceholder: "例如：苏州周末小旅行" },
  { value: "anniversary", label: "纪念日", eyebrow: "ANNIVERSARY", titlePlaceholder: "例如：第一次见面的日子" }
];

function todayText() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}.${month}.${day}`;
}

function inputDate(value) {
  if (!value) return todayText();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? todayText() : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function emptyForm() {
  const today = todayText();
  return {
    title: "",
    detail: "",
    startDate: today,
    endDate: today,
    rewardPoints: "",
    assigneeIndex: 2,
    checklistText: "",
    itineraryText: "",
    category: "",
    tagsText: "",
    preference: 3,
    budget: ""
  };
}

function decoratePlan(plan) {
  const config = PLAN_TYPES.find((item) => item.value === plan.type) || PLAN_TYPES[0];
  const isDone = plan.status === "done";
  const startText = formatDate(plan.startAt);
  const endText = formatDate(plan.endAt);
  const dateText = startText && endText && startText !== endText ? `${startText} — ${endText}` : startText || endText;
  let actionLabel = isDone ? "重新打开" : "标记完成";
  if (plan.type === "menu") actionLabel = isDone ? "再次候选" : "标记吃过";
  if (plan.type === "trip") actionLabel = isDone ? "重新规划" : "旅行完成";

  return {
    ...plan,
    typeLabel: config.label,
    statusLabel: isDone ? "已完成" : plan.status === "doing" ? "进行中" : "待完成",
    isDone,
    dateText,
    actionLabel,
    rewardText: plan.rewardPoints > 0 ? `${plan.rewardPoints} 积分` : "",
    categoryText: plan.payload && plan.payload.category ? plan.payload.category : "",
    preferenceText: plan.payload && plan.payload.preference ? `喜欢 ${plan.payload.preference}/5` : "",
    budgetText: plan.payload && plan.payload.budget ? `预算 ${plan.payload.budget} 元` : "",
    checklist: plan.payload && Array.isArray(plan.payload.checklist) ? plan.payload.checklist : [],
    itinerary: plan.payload && Array.isArray(plan.payload.itinerary) ? plan.payload.itinerary : []
  };
}

Page({
  data: {
    planTypes: PLAN_TYPES,
    activeType: "task",
    activeConfig: PLAN_TYPES[0],
    plans: [],
    form: emptyForm(),
    pickedMenu: null,
    editingId: "",
    editingVersion: 0,
    openid: "",
    couple: null,
    assigneeOptions: ["我", "伴侣", "两人共同"],
    isLoading: false,
    isSubmitting: false,
    changingPlanId: "",
    isPicking: false,
    error: ""
  },

  onShow() {
    this.loadContext();
    this.loadPlans();
  },

  loadContext() {
    return Promise.all([cloudApi.login(), cloudApi.getMyCouple()])
      .then(([identity, couple]) => this.setData({ openid: identity.openid, couple }))
      .catch(() => {});
  },

  onPullDownRefresh() {
    this.loadPlans(true);
  },

  switchType(event) {
    const activeType = event.currentTarget.dataset.type;
    if (!activeType || activeType === this.data.activeType || this.data.isLoading) return;
    const activeConfig = PLAN_TYPES.find((item) => item.value === activeType);
    this.setData({ activeType, activeConfig, form: emptyForm(), pickedMenu: null, editingId: "", editingVersion: 0, error: "" });
    this.loadPlans();
  },

  loadPlans(fromPullDown) {
    if (this.data.isLoading) {
      if (fromPullDown) wx.stopPullDownRefresh();
      return;
    }

    this.setData({ isLoading: true, error: "" });
    cloudApi
      .listPlans({ type: this.data.activeType, limit: 50 })
      .then((result) => {
        this.setData({ plans: result.plans.map(decoratePlan) });
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "计划加载失败，请稍后重试");
        this.setData({ plans: [], error: message });
      })
      .finally(() => {
        this.setData({ isLoading: false });
        if (fromPullDown) wx.stopPullDownRefresh();
      });
  },

  onFieldInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onDateChange(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onAssigneeChange(event) {
    this.setData({ "form.assigneeIndex": Number(event.detail.value) });
  },

  buildPlan() {
    const { activeType, form } = this.data;
    const current = this.data.plans.find((item) => item._id === this.data.editingId);
    const plan = {
      type: activeType,
      title: form.title.trim(),
      detail: form.detail.trim(),
      status: current ? current.status : "todo",
      rewardPoints: activeType === "task" ? Number(form.rewardPoints) || 0 : 0,
      payload: {}
    };

    if (activeType === "task") {
      const members = (this.data.couple && this.data.couple.members) || [];
      const partner = members.find((member) => member !== this.data.openid);
      if (form.assigneeIndex === 0) plan.assigneeOpenids = this.data.openid ? [this.data.openid] : [];
      if (form.assigneeIndex === 1) plan.assigneeOpenids = partner ? [partner] : [];
      if (form.assigneeIndex === 2) plan.assigneeOpenids = members;
      plan.endAt = form.endDate;
      plan.payload.checklist = form.checklistText
        .split(/\r?\n/)
        .map((title) => title.trim())
        .filter(Boolean)
        .slice(0, 20)
        .map((title) => {
          const existing = current && current.checklist && current.checklist.find((item) => item.title === title);
          return { title: title.slice(0, 80), done: Boolean(existing && existing.done) };
        });
    }
    if (activeType === "event" || activeType === "anniversary") plan.startAt = form.startDate;
    if (activeType === "menu") {
      plan.payload.category = form.category.trim();
      plan.payload.preference = Number(form.preference) || 3;
      plan.payload.tags = form.tagsText.split(/[，,、\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
    }
    if (activeType === "trip") {
      plan.startAt = form.startDate;
      plan.endAt = form.endDate;
      plan.payload.budget = Math.max(Number(form.budget) || 0, 0);
      plan.payload.itinerary = form.itineraryText
        .split(/\r?\n/)
        .map((title) => title.trim())
        .filter(Boolean)
        .slice(0, 30);
      plan.payload.checklist = form.checklistText
        .split(/\r?\n/)
        .map((title) => title.trim())
        .filter(Boolean)
        .slice(0, 20)
        .map((title) => {
          const existing = current && current.checklist && current.checklist.find((item) => item.title === title);
          return { title: title.slice(0, 80), done: Boolean(existing && existing.done) };
        });
    }
    return plan;
  },

  createPlan() {
    if (this.data.isSubmitting) return;
    if (!this.data.couple) {
      wx.showToast({ title: "情侣空间尚未加载完成", icon: "none" });
      return;
    }
    const plan = this.buildPlan();
    if (!plan.title) {
      wx.showToast({ title: "请先填写名称", icon: "none" });
      return;
    }
    if (plan.startAt && plan.endAt && new Date(plan.endAt) < new Date(plan.startAt)) {
      wx.showToast({ title: "结束日期不能早于开始日期", icon: "none" });
      return;
    }

    this.setData({ isSubmitting: true, error: "" });
    const wasEditing = Boolean(this.data.editingId);
    const request = wasEditing
      ? cloudApi.updatePlan(this.data.editingId, this.data.editingVersion, plan)
      : cloudApi.createPlan(plan);
    request
      .then((created) => {
        const plans = wasEditing
          ? this.data.plans.map((item) => item._id === created._id ? decoratePlan(created) : item)
          : [decoratePlan(created), ...this.data.plans];
        this.setData({ plans, form: emptyForm(), editingId: "", editingVersion: 0 });
        wx.showToast({ title: wasEditing ? "修改已保存" : "已加入共同计划" });
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "计划保存失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        this.setData({ isSubmitting: false });
      });
  },

  startEdit(event) {
    const plan = this.data.plans.find((item) => item._id === event.currentTarget.dataset.id);
    if (!plan || this.data.isSubmitting) return;
    const members = (this.data.couple && this.data.couple.members) || [];
    const partner = members.find((member) => member !== this.data.openid);
    let assigneeIndex = 2;
    if (plan.assigneeOpenids && plan.assigneeOpenids.length === 1) {
      assigneeIndex = plan.assigneeOpenids[0] === partner ? 1 : 0;
    }
    this.setData({
      editingId: plan._id,
      editingVersion: Number(plan.version || 1),
      form: {
        title: plan.title || "", detail: plan.detail || "",
        startDate: inputDate(plan.startAt), endDate: inputDate(plan.endAt),
        rewardPoints: plan.rewardPoints ? String(plan.rewardPoints) : "",
        assigneeIndex,
        checklistText: (plan.checklist || []).map((item) => item.title).join("\n"),
        itineraryText: (plan.itinerary || []).join("\n"),
        category: plan.payload && plan.payload.category || "",
        tagsText: plan.payload && Array.isArray(plan.payload.tags) ? plan.payload.tags.join("，") : "",
        preference: plan.payload && Number(plan.payload.preference) || 3,
        budget: plan.payload && plan.payload.budget ? String(plan.payload.budget) : ""
      }
    });
    wx.pageScrollTo({ scrollTop: 180, duration: 250 });
  },

  cancelEdit() {
    this.setData({ editingId: "", editingVersion: 0, form: emptyForm() });
  },

  deletePlan(event) {
    const planId = event.currentTarget.dataset.id;
    if (!planId || this.data.changingPlanId) return;
    wx.showModal({ title: "删除这项计划？", content: "删除后不会再出现在共同计划和日历中。", confirmText: "删除", success: (result) => {
      if (!result.confirm) return;
      this.setData({ changingPlanId: planId });
      cloudApi.deletePlan(planId)
        .then(() => this.setData({ plans: this.data.plans.filter((item) => item._id !== planId) }))
        .catch((error) => this.setData({ error: cloudApi.getErrorMessage(error, "计划删除失败") }))
        .finally(() => this.setData({ changingPlanId: "" }));
    } });
  },

  toggleStatus(event) {
    const planId = event.currentTarget.dataset.id;
    const current = this.data.plans.find((plan) => plan._id === planId);
    if (!current || this.data.changingPlanId) return;
    const status = current.isDone ? "todo" : "done";

    this.setData({ changingPlanId: planId, error: "" });
    cloudApi
      .setPlanStatus(planId, status)
      .then(() => {
        const plans = this.data.plans.map((plan) =>
          plan._id === planId ? decoratePlan({ ...plan, status }) : plan
        );
        this.setData({ plans });
        wx.showToast({ title: status === "done" ? "已完成" : "已重新打开" });
        if (current.type === "menu" && status === "done") {
          return cloudApi.createRecord({
            type: "outing",
            title: `吃过：${current.title}`,
            content: current.detail || "从共同菜单标记为吃过。",
            visibility: "couple",
            startAt: new Date().toISOString(),
            relatedPlanId: current._id,
            payload: { category: "吃饭", menuPlanId: current._id }
          });
        }
        if (current.type === "trip" && status === "done") {
          return cloudApi.createRecord({
            type: "outing",
            title: `旅行完成：${current.title}`,
            content: current.detail || "共同旅行计划已完成。",
            visibility: "couple",
            startAt: new Date().toISOString(),
            relatedPlanId: current._id,
            payload: { category: "旅行", tripPlanId: current._id }
          });
        }
        return null;
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "状态更新失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        this.setData({ changingPlanId: "" });
      });
  },

  toggleChecklist(event) {
    const planId = event.currentTarget.dataset.id;
    const index = Number(event.currentTarget.dataset.index);
    if (!planId || !Number.isInteger(index) || this.data.changingPlanId) return;
    this.setData({ changingPlanId: planId, error: "" });
    cloudApi.togglePlanChecklist(planId, index)
      .then((updated) => {
        this.setData({ plans: this.data.plans.map((plan) => plan._id === planId ? decoratePlan(updated) : plan) });
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "清单更新失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => this.setData({ changingPlanId: "" }));
  },

  pickMenu() {
    if (this.data.isPicking) return;
    this.setData({ isPicking: true, error: "" });
    const excludeIds = this.data.pickedMenu ? [this.data.pickedMenu._id] : [];
    cloudApi
      .randomMenu(excludeIds)
      .then((plan) => {
        if (!plan && excludeIds.length > 0) return cloudApi.randomMenu([]);
        return plan;
      })
      .then((plan) => {
        this.setData({ pickedMenu: plan ? decoratePlan(plan) : null });
        if (!plan) wx.showToast({ title: "先添加一个菜单候选吧", icon: "none" });
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "随机选择失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        this.setData({ isPicking: false });
      });
  }
});
