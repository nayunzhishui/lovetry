const { nextAnniversary } = require("./anniversary");

function localDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysBetween(dateText, now) {
  const target = new Date(`${dateText}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function buildReminderCandidates(plans, now = new Date(), inventory = []) {
  const planReminders = (Array.isArray(plans) ? plans : [])
    .map((plan) => {
      const reminderDays = Math.min(Math.max(Number(plan.payload && plan.payload.reminderDays) || (plan.type === "task" ? 1 : 3), 0), 30);
      if (plan.type === "task") {
        if (plan.status === "done" || plan.status === "archived" || !plan.endAt) return null;
        const scheduledDate = localDate(plan.endAt);
        const daysRemaining = daysBetween(scheduledDate, now);
        if (daysRemaining < 0 || daysRemaining > reminderDays) return null;
        return { type: "task", sourceId: plan._id, title: plan.title, scheduledDate, daysRemaining };
      }
      if (plan.type === "anniversary" && plan.startAt) {
        const next = nextAnniversary(localDate(plan.startAt), now);
        if (!next || next.daysRemaining > reminderDays) return null;
        return { type: "anniversary", sourceId: plan._id, title: plan.title, scheduledDate: next.date, daysRemaining: next.daysRemaining };
      }
      return null;
    })
    .filter(Boolean);
  const rewardReminders = (Array.isArray(inventory) ? inventory : [])
    .filter((item) => item && item.status === "pending")
    .map((item) => ({
      type: "rewardApproval",
      sourceId: item._id,
      title: `待兑现：${item.title}`,
      scheduledDate: localDate(now),
      daysRemaining: 0
    }));
  return [...planReminders, ...rewardReminders]
    .sort((a, b) => a.daysRemaining - b.daysRemaining || a.sourceId.localeCompare(b.sourceId));
}

function reminderKey(coupleId, openid, reminder) {
  return `${coupleId}:${openid}:${reminder.type}:${reminder.sourceId}:${reminder.scheduledDate}`;
}

module.exports = { buildReminderCandidates, reminderKey };
