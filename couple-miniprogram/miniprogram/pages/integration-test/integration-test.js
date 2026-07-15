const api = require("../../services/cloudApi");

Page({
  data: {
    running: false,
    steps: [
      { key: "login", label: "登录身份", status: "idle", detail: "等待检查" },
      { key: "couple", label: "情侣空间", status: "idle", detail: "等待检查" },
      { key: "records", label: "记录读取", status: "idle", detail: "等待检查" },
      { key: "plans", label: "计划服务", status: "idle", detail: "等待检查" },
      { key: "rewards", label: "奖励服务", status: "idle", detail: "等待检查" },
      { key: "media", label: "相册服务", status: "idle", detail: "等待检查" },
      { key: "dashboard", label: "聚合服务", status: "idle", detail: "等待检查" },
      { key: "notifications", label: "提醒服务", status: "idle", detail: "等待检查" }
    ],
    error: ""
  },

  setStep(key, status, detail) {
    this.setData({
      steps: this.data.steps.map((step) => (step.key === key ? { ...step, status, detail } : step))
    });
  },

  async runChecks() {
    if (this.data.running) return;
    this.setData({ running: true, error: "" });
    try {
      this.setStep("login", "running", "正在获取身份");
      const login = await api.login();
      this.setStep("login", "success", login.openid ? `OpenID：${login.openid.slice(0, 8)}…` : "身份获取成功");

      this.setStep("couple", "running", "正在查询情侣空间");
      const couple = await api.getMyCouple();
      this.setStep(
        "couple",
        couple ? "success" : "warning",
        couple ? `空间正常，成员 ${couple.members.length}/2` : "尚未创建或加入情侣空间"
      );

      if (!couple) {
        ["records", "plans", "rewards", "media", "dashboard", "notifications"].forEach((key) => {
          this.setStep(key, "warning", "绑定情侣空间后才能检查");
        });
        return;
      }

      this.setStep("records", "running", "正在读取记录");
      const records = await api.listRecords({ limit: 5 });
      this.setStep("records", "success", `读取成功，共返回 ${records.length} 条`);

      this.setStep("plans", "running", "正在读取共同计划");
      const planResult = await api.listPlans({ limit: 5 });
      this.setStep("plans", "success", `读取成功，共返回 ${planResult.plans.length} 项`);

      this.setStep("rewards", "running", "正在核对积分账户");
      const rewardResult = await api.getRewardSummary();
      this.setStep("rewards", "success", `账户正常，共 ${rewardResult.wallets.length} 个`);

      this.setStep("media", "running", "正在读取相册");
      const albums = await api.listAlbums();
      this.setStep("media", "success", `读取成功，共 ${albums.length} 个相册`);

      this.setStep("dashboard", "running", "正在检查云函数版本");
      const health = await api.getServiceHealth();
      this.setStep("dashboard", "success", `${health.modules.length} 个模块可用`);

      this.setStep("notifications", "running", "正在读取提醒偏好");
      const preferences = await api.getNotificationPreferences();
      this.setStep("notifications", "success", preferences.enabled ? "提醒中心已启用" : "提醒中心当前关闭");
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "联调检查失败") });
      const running = this.data.steps.find((step) => step.status === "running");
      if (running) this.setStep(running.key, "error", error.code || "检查失败");
    } finally {
      this.setData({ running: false });
    }
  },

  async createTestRecord() {
    if (this.data.running) return;
    this.setData({ running: true, error: "" });
    try {
      await api.createRecord({
        type: "moment",
        title: "联调测试记录",
        content: "由联调检查页创建，可随时清理。",
        visibility: "private",
        isTest: true
      });
      wx.showToast({ title: "测试记录已创建" });
      this.setData({ running: false });
      await this.runChecks();
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "创建测试记录失败") });
    } finally {
      this.setData({ running: false });
    }
  },

  async cleanup() {
    if (this.data.running) return;
    this.setData({ running: true, error: "" });
    try {
      const result = await api.cleanupTestData();
      wx.showToast({ title: `已清理 ${result.deletedCount || 0} 条` });
      this.setData({ running: false });
      await this.runChecks();
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "清理测试数据失败") });
    } finally {
      this.setData({ running: false });
    }
  }
});
