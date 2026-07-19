const api = require("../../services/cloudApi");
const { presentCalendarEvents } = require("../../shared/calendar-view");

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}

function changeMonth(page, offset) {
  const month = new Date(page.data.month);
  month.setDate(1);
  month.setMonth(month.getMonth() + offset);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(page.data.selectedKey || ""));
  const preferredDay = match ? Number(match[3]) : 1;
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const selectedKey = dateKey(new Date(month.getFullYear(), month.getMonth(), Math.min(preferredDay, lastDay)));
  page.setData({ selectedKey });
  page.loadMonth(month);
}

function buildDays(month, events, today = new Date()) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let blank = 0; blank < first.getDay(); blank += 1) cells.push({ key: `blank-${blank}`, blank: true });
  for (let day = 1; day <= total; day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const key = dateKey(date);
    const dayEvents = events.filter((event) => {
      if (dateKey(event.startAt) === key) return true;
      if (event.type !== "period" || !event.endAt) return false;
      const current = date.getTime();
      const start = new Date(event.startAt).setHours(0, 0, 0, 0);
      const end = new Date(event.endAt).setHours(23, 59, 59, 999);
      return current >= start && current <= end;
    });
    cells.push({
      key,
      day,
      eventCount: dayEvents.length,
      events: dayEvents,
      hasPeriod: dayEvents.some((event) => event.type === "period"),
      hasIntimacy: dayEvents.some((event) => event.type === "intimacy"),
      hasGeneral: dayEvents.some((event) => !["period", "intimacy"].includes(event.type)),
      isToday: key === dateKey(today)
    });
  }
  return cells;
}

Page({
  data: {
    month: new Date(),
    monthLabel: "",
    days: [],
    events: [],
    filters: [
      { value: "", label: "全部" }, { value: "record", label: "记录" }, { value: "plan", label: "计划" },
      { value: "period", label: "生理期" }, { value: "intimacy", label: "亲密" },
      { value: "mood", label: "心情" }, { value: "task", label: "任务" }, { value: "anniversary", label: "纪念日" }
    ],
    activeFilter: "",
    selectedKey: "",
    selectedEvents: [],
    todayKey: "",
    loading: false,
    error: ""
  },

  onLoad() {
    const now = new Date();
    this.setData({ selectedKey: dateKey(now), todayKey: dateKey(now) });
    this.loadMonth(now);
  },

  async loadMonth(month) {
    const emptyDays = buildDays(month, []);
    this.setData({
      loading: true,
      error: "",
      month,
      monthLabel: `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`,
      days: emptyDays,
      selectedEvents: []
    });
    try {
      const { start, end } = monthRange(month);
      const events = presentCalendarEvents(await api.getCalendarEvents(start.toISOString(), end.toISOString()));
      const visibleEvents = this.filterEvents(events, this.data.activeFilter);
      const days = buildDays(month, visibleEvents);
      const selected = days.find((day) => day.key === this.data.selectedKey);
      this.setData({
        events,
        days,
        selectedEvents: selected?.events || []
      });
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "日历加载失败") });
    } finally {
      this.setData({ loading: false });
    }
  },

  filterEvents(events, filter) {
    if (!filter) return events;
    if (filter === "record" || filter === "plan") return events.filter((item) => item.source === filter);
    return events.filter((item) => item.type === filter);
  },

  selectFilter(event) {
    const activeFilter = event.currentTarget.dataset.filter || "";
    const days = buildDays(new Date(this.data.month), this.filterEvents(this.data.events, activeFilter));
    const selected = days.find((day) => day.key === this.data.selectedKey);
    this.setData({ activeFilter, days, selectedEvents: selected?.events || [] });
  },

  previousMonth() {
    changeMonth(this, -1);
  },

  nextMonth() {
    changeMonth(this, 1);
  },

  goToday() {
    const now = new Date();
    const key = dateKey(now);
    this.setData({ selectedKey: key, todayKey: key });
    this.loadMonth(now);
  },

  retryMonth() {
    this.loadMonth(new Date(this.data.month));
  },

  addRecordForSelectedDay() {
    wx.navigateTo({ url: `/pages/record-form/record-form?type=moment&date=${this.data.selectedKey}` });
  },

  addPeriodForSelectedDay() {
    wx.navigateTo({ url: `/pages/record-form/record-form?type=period&date=${this.data.selectedKey}` });
  },

  addIntimacyForSelectedDay() {
    wx.navigateTo({ url: `/pages/record-form/record-form?type=intimacy&date=${this.data.selectedKey}` });
  },

  addPlanForSelectedDay() {
    wx.navigateTo({ url: `/pages/plans/plans?type=event&date=${this.data.selectedKey}` });
  },

  selectDay(event) {
    const key = event.currentTarget.dataset.key;
    const day = this.data.days.find((item) => item.key === key);
    if (!day || day.blank) return;
    this.setData({ selectedKey: key, selectedEvents: day.events || [] });
  },

  openEvent(event) {
    const item = this.data.selectedEvents.find((entry) => entry.id === event.currentTarget.dataset.id);
    if (!item) return;
    wx.navigateTo({ url: item.source === "record"
      ? `/pages/record-detail/record-detail?id=${encodeURIComponent(item.id)}`
      : `/pages/plans/plans?type=${encodeURIComponent(item.type || "task")}&date=${this.data.selectedKey}` });
  }
});
