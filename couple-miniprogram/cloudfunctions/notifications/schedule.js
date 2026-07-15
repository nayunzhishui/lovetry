function localDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextYearlyDate(value, now) {
  const source = new Date(value);
  if (Number.isNaN(source.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const month = source.getMonth();
  const day = source.getDate();
  const create = (year) => {
    if (month === 1 && day === 29 && new Date(year, 1, 29).getMonth() !== 1) return new Date(year, 1, 28);
    return new Date(year, month, day);
  };
  let candidate = create(today.getFullYear());
  if (candidate < today) candidate = create(today.getFullYear() + 1);
  return candidate;
}

function buildReminderCandidates(plans, now = new Date(), inventory = []) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const planReminders = (plans || []).map((plan) => {
    const reminderDays = Math.min(Math.max(Number(plan.payload && plan.payload.reminderDays) || (plan.type === "task" ? 1 : 3), 0), 30);
    let target;
    if (plan.type === "task" && plan.status !== "done" && plan.status !== "archived") target = new Date(plan.endAt);
    if (plan.type === "anniversary") target = nextYearlyDate(plan.startAt, now);
    if (!target || Number.isNaN(target.getTime())) return null;
    target = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const daysRemaining = Math.round((target - today) / 86400000);
    if (daysRemaining < 0 || daysRemaining > reminderDays) return null;
    return { type: plan.type, sourceId: plan._id, title: plan.title, scheduledDate: localDate(target), daysRemaining };
  }).filter(Boolean);
  const rewardReminders = (inventory || [])
    .filter((item) => item && item.status === "pending")
    .map((item) => ({
      type: "rewardApproval",
      sourceId: item._id,
      title: `待兑现：${item.title}`,
      scheduledDate: localDate(today),
      daysRemaining: 0
    }));
  return [...planReminders, ...rewardReminders].sort((a, b) => a.daysRemaining - b.daysRemaining);
}

module.exports = { buildReminderCandidates };
