const cloudApi = require("../../services/cloudApi");
const { isCoupleMissing, isCoupleRequiredError } = require("../../services/coupleGate");
const { formatCompact } = require("../../shared/format-date");

function decorateTransaction(item) {
  const isEarn = item.kind === "earn";
  return {
    ...item,
    isEarn,
    kindLabel: isEarn ? "获得" : "消费",
    amountText: `${isEarn ? "+" : "−"}${item.amount}`,
    createdAtText: formatCompact(item.createdAt)
  };
}

function requestKey(kind, openid) {
  const random = Math.random().toString(36).slice(2, 10);
  return `manual:${kind}:${openid}:${Date.now()}:${random}`;
}

function requestKeyFor(kind, openid, payload) {
  const storageKey = `lovetry_reward_request_${kind}`;
  const signature = JSON.stringify(payload);
  try {
    const saved = wx.getStorageSync(storageKey);
    if (saved && saved.signature === signature && saved.key) return saved.key;
    const key = requestKey(kind, openid);
    wx.setStorageSync(storageKey, { signature, key });
    return key;
  } catch (error) {
    return requestKey(kind, openid);
  }
}

function clearRequestKey(kind) {
  try { wx.removeStorageSync(`lovetry_reward_request_${kind}`); } catch (error) { /* retry key expires with local storage */ }
}

Page({
  data: {
    openid: "",
    couple: null,
    partnerOpenid: "",
    wallets: [],
    selectedOwnerOpenid: "",
    transactions: [],
    pendingTasks: [],
    actionMode: "grant",
    grantForm: { title: "", amount: "" },
    spendForm: { title: "", amount: "" },
    quickAmounts: [5, 10, 20, 50],
    isLoading: false,
    isLoadingTransactions: false,
    transactionsHasMore: false,
    loadingMoreTransactions: false,
    isSubmitting: false,
    needsCouple: false,
    error: ""
  },

  onShow() {
    // 未绑定伴侣时直接展示引导，不发起注定失败的云函数调用
    if (isCoupleMissing(getApp().globalData)) {
      this.setData({ needsCouple: true, isLoading: false });
      return;
    }
    if (this.data.needsCouple) this.setData({ needsCouple: false });
    this.loadRewards();
  },

  onPullDownRefresh() {
    this.loadRewards(true);
  },

  loadRewards(fromPullDown) {
    if (this.data.isLoading) {
      if (fromPullDown) wx.stopPullDownRefresh();
      return;
    }

    this.setData({ isLoading: true, error: "" });
    Promise.all([cloudApi.login(), cloudApi.getMyCouple(), cloudApi.getRewardSummary(), cloudApi.listPendingRewardTasks()])
      .then(([identity, couple, summary, pendingTasks]) => {
        const openid = identity.openid;
        const partnerOpenid = couple && couple.members
          ? couple.members.find((member) => member !== openid) || ""
          : "";
        const wallets = (summary.wallets || [])
          .map((wallet) => ({
            ...wallet,
            isMine: wallet.ownerOpenid === openid,
            ownerLabel: wallet.ownerOpenid === openid ? "我的账户" : "伴侣账户"
          }))
          .sort((a, b) => Number(b.isMine) - Number(a.isMine));
        const selectedOwnerOpenid = this.data.selectedOwnerOpenid || openid;
        this.setData({ openid, couple, partnerOpenid, wallets, selectedOwnerOpenid, pendingTasks });
        return this.loadTransactions(selectedOwnerOpenid);
      })
      .catch((error) => {
        if (isCoupleRequiredError(error)) {
          this.setData({ needsCouple: true, wallets: [], transactions: [], error: "" });
          return;
        }
        const message = cloudApi.getErrorMessage(error, "奖励账户加载失败，请稍后重试");
        this.setData({ error: message, wallets: [], transactions: [] });
      })
      .finally(() => {
        this.setData({ isLoading: false });
        if (fromPullDown) wx.stopPullDownRefresh();
      });
  },

  loadTransactions(ownerOpenid) {
    if (!ownerOpenid) return Promise.resolve();
    this.setData({ isLoadingTransactions: true });
    return cloudApi
      .listRewardTransactions({ ownerOpenid, limit: 50, offset: 0 })
      .then((result) => {
        this.setData({
          transactions: result.transactions.map(decorateTransaction),
          transactionsHasMore: result.page.hasMore
        });
      })
      .finally(() => {
        this.setData({ isLoadingTransactions: false });
      });
  },

  // 触底只追加当前选中账户的流水，不影响页面其它区块
  onReachBottom() {
    this.loadMoreTransactions();
  },

  loadMoreTransactions() {
    const ownerOpenid = this.data.selectedOwnerOpenid;
    if (
      !ownerOpenid ||
      this.data.needsCouple ||
      this.data.isLoading ||
      this.data.isLoadingTransactions ||
      this.data.loadingMoreTransactions ||
      !this.data.transactionsHasMore
    ) return;
    this.setData({ loadingMoreTransactions: true });
    cloudApi
      .listRewardTransactions({ ownerOpenid, limit: 50, offset: this.data.transactions.length })
      .then((result) => {
        // 追加期间切换了账户时丢弃过期结果
        if (ownerOpenid !== this.data.selectedOwnerOpenid) return;
        this.setData({
          transactions: [...this.data.transactions, ...result.transactions.map(decorateTransaction)],
          transactionsHasMore: result.page.hasMore
        });
      })
      .catch((error) => {
        wx.showToast({ title: cloudApi.getErrorMessage(error, "更多流水加载失败，请稍后重试"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loadingMoreTransactions: false });
      });
  },

  selectWallet(event) {
    const ownerOpenid = event.currentTarget.dataset.openid;
    if (!ownerOpenid || ownerOpenid === this.data.selectedOwnerOpenid || this.data.isLoadingTransactions) return;
    this.setData({ selectedOwnerOpenid: ownerOpenid, transactions: [], transactionsHasMore: false, error: "" });
    this.loadTransactions(ownerOpenid).catch((error) => {
      const message = cloudApi.getErrorMessage(error, "流水加载失败，请稍后重试");
      this.setData({ error: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  switchAction(event) {
    const actionMode = event.currentTarget.dataset.mode;
    if (!actionMode || actionMode === this.data.actionMode || this.data.isSubmitting) return;
    this.setData({ actionMode, error: "" });
  },

  goRewardStore(event) {
    const mode = event.currentTarget.dataset.mode || "store";
    wx.navigateTo({ url: `/features/reward-store/reward-store?mode=${mode}` });
  },

  onFormInput(event) {
    const form = event.currentTarget.dataset.form;
    const field = event.currentTarget.dataset.field;
    this.setData({ [`${form}.${field}`]: event.detail.value });
  },

  selectQuickAmount(event) {
    if (this.data.isSubmitting) return;
    const amount = String(Number(event.currentTarget.dataset.amount) || "");
    const form = this.data.actionMode === "grant" ? "grantForm" : "spendForm";
    this.setData({ [`${form}.amount`]: amount });
  },

  validateForm(form) {
    const title = form.title.trim();
    const amount = Number(form.amount);
    if (!title) {
      wx.showToast({ title: "请填写这笔积分的说明", icon: "none" });
      return null;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      wx.showToast({ title: "积分需要是大于 0 的整数", icon: "none" });
      return null;
    }
    return { title, amount };
  },

  submitGrant() {
    if (this.data.isSubmitting) return;
    if (!this.data.partnerOpenid) {
      wx.showToast({ title: "伴侣加入后才能赠送积分", icon: "none" });
      return;
    }
    const payload = this.validateForm(this.data.grantForm);
    if (!payload) return;

    this.setData({ isSubmitting: true, error: "" });
    cloudApi
      .grantReward({
        ...payload,
        targetOpenid: this.data.partnerOpenid,
        sourceType: "manual",
        idempotencyKey: requestKeyFor("grant", this.data.openid, { ...payload, targetOpenid: this.data.partnerOpenid })
      })
      .then(() => {
        clearRequestKey("grant");
        this.setData({ grantForm: { title: "", amount: "" } });
        wx.showToast({ title: "积分已送给伴侣" });
        return this.refreshAfterChange(this.data.partnerOpenid);
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "积分赠送失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        this.setData({ isSubmitting: false });
      });
  },

  submitSpend() {
    if (this.data.isSubmitting) return;
    const payload = this.validateForm(this.data.spendForm);
    if (!payload) return;

    this.setData({ isSubmitting: true, error: "" });
    cloudApi
      .spendReward({
        ...payload,
        sourceType: "redeem",
        idempotencyKey: requestKeyFor("spend", this.data.openid, payload)
      })
      .then(() => {
        clearRequestKey("spend");
        this.setData({ spendForm: { title: "", amount: "" } });
        wx.showToast({ title: "已记录本次消费" });
        return this.refreshAfterChange(this.data.openid);
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "积分消费失败，请检查余额");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        this.setData({ isSubmitting: false });
      });
  },

  settleTask(event) {
    const planId = event.currentTarget.dataset.id;
    if (!planId || !this.data.partnerOpenid || this.data.isSubmitting) return;
    this.setData({ isSubmitting: true, error: "" });
    cloudApi.settleTaskReward({ planId, targetOpenid: this.data.partnerOpenid })
      .then(() => {
        this.setData({ pendingTasks: this.data.pendingTasks.filter((task) => task._id !== planId) });
        wx.showToast({ title: "任务积分已确认" });
        return this.refreshAfterChange(this.data.partnerOpenid);
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "任务积分确认失败");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => this.setData({ isSubmitting: false }));
  },

  refreshAfterChange(ownerOpenid) {
    return cloudApi.getRewardSummary().then((summary) => {
      const wallets = (summary.wallets || [])
        .map((wallet) => ({
          ...wallet,
          isMine: wallet.ownerOpenid === this.data.openid,
          ownerLabel: wallet.ownerOpenid === this.data.openid ? "我的账户" : "伴侣账户"
        }))
        .sort((a, b) => Number(b.isMine) - Number(a.isMine));
      this.setData({ wallets, selectedOwnerOpenid: ownerOpenid });
      return this.loadTransactions(ownerOpenid);
    });
  }
});
