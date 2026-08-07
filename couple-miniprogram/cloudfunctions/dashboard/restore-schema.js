const RECORD_TYPES = new Set([
  "moment", "mood", "conflict", "outing", "sleep", "period", "intimacy", "game", "pomodoro"
]);
const PLAN_TYPES = new Set(["task", "event", "menu", "trip", "anniversary"]);
const STATUSES = new Set(["todo", "doing", "done", "archived"]);
const PRIVATE_BY_DEFAULT = new Set(["mood", "conflict", "sleep", "period", "intimacy", "pomodoro"]);
const REPAIR_STATUSES = new Set(["noted", "preparing", "talked", "later"]);
const POMODORO_RESULTS = new Set(["completed", "interrupted"]);

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function number(value, min, max, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function date(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function textList(value, maxItems, maxLength) {
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function checklist(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => objectValue(item))
    .map((item) => ({ title: text(item.title, 80), done: item.done === true }))
    .filter((item) => item.title)
    .slice(0, 20);
}

function recordMetrics(type, input) {
  const metrics = objectValue(input);
  if (type === "sleep" || type === "game") {
    const durationMinutes = Math.round(number(metrics.durationMinutes, 1, 1440, 0));
    return durationMinutes ? { durationMinutes } : {};
  }
  if (type === "pomodoro") {
    const plannedMinutes = Math.round(number(metrics.plannedMinutes, 1, 240, 0));
    const durationMinutes = Math.round(number(metrics.durationMinutes, 1, 240, 0));
    return {
      ...(plannedMinutes ? { plannedMinutes } : {}),
      ...(durationMinutes ? { durationMinutes } : {}),
      completed: metrics.completed === true
    };
  }
  return {};
}

function recordPayload(type, input) {
  const payload = objectValue(input);
  if (type === "mood") return {
    level: Math.round(number(payload.level, 1, 5, 3)),
    tags: textList(payload.tags, 8, 30)
  };
  if (type === "conflict") return {
    feelings: text(payload.feelings, 1000),
    needs: text(payload.needs, 1000),
    communication: text(payload.communication, 1600),
    agreement: text(payload.agreement || payload.result, 1600),
    satisfaction: Math.round(number(payload.satisfaction, 1, 10, 5)),
    repairStatus: REPAIR_STATUSES.has(payload.repairStatus) ? payload.repairStatus : "noted"
  };
  if (type === "outing") return {
    category: text(payload.category, 40),
    location: text(payload.location, 120),
    amount: payload.amount === null || payload.amount === undefined || payload.amount === ""
      ? null
      : Math.round(number(payload.amount, 0, 100000000, 0) * 100) / 100,
    rating: Math.round(number(payload.rating, 1, 5, 3))
  };
  if (type === "sleep") return { quality: Math.round(number(payload.quality, 1, 5, 3)) };
  if (type === "period") return { flow: text(payload.flow, 20) };
  if (type === "intimacy") return { protection: text(payload.protection, 20), comfort: text(payload.comfort, 20) };
  if (type === "game") return { participants: text(payload.participants, 200) };
  if (type === "pomodoro") return {
    phase: "focus",
    result: POMODORO_RESULTS.has(payload.result) ? payload.result : "interrupted"
  };
  return {};
}

function normalizeRestoredRecord(source, openid) {
  const record = objectValue(source);
  const type = text(record.type, 30);
  if (!RECORD_TYPES.has(type)) return null;
  const title = text(record.title, 80);
  const content = text(record.content, 5000);
  if (!title && !content) return null;
  return {
    type,
    visibility: record.visibility === "private" || record.visibility === "couple"
      ? record.visibility
      : PRIVATE_BY_DEFAULT.has(type) ? "private" : "couple",
    ownerOpenid: openid,
    creatorOpenid: openid,
    title,
    content,
    startAt: date(record.startAt),
    endAt: date(record.endAt),
    metrics: recordMetrics(type, record.metrics),
    payload: recordPayload(type, record.payload),
    relatedPlanId: text(record.relatedPlanId, 64),
    isTest: false
  };
}

function planPayload(type, input) {
  const payload = objectValue(input);
  if (type === "task") return { checklist: checklist(payload.checklist) };
  if (type === "menu") return {
    category: text(payload.category, 40),
    preference: Math.round(number(payload.preference, 1, 5, 3)),
    tags: textList(payload.tags, 8, 30)
  };
  if (type === "trip") return {
    budget: Math.round(number(payload.budget, 0, 100000000, 0) * 100) / 100,
    itinerary: textList(payload.itinerary, 30, 120),
    checklist: checklist(payload.checklist)
  };
  if (type === "anniversary") return {
    repeatYearly: payload.repeatYearly !== false,
    reminderDays: Math.round(number(payload.reminderDays, 0, 30, 3))
  };
  return {};
}

function normalizeRestoredPlan(source, couple, openid) {
  const plan = objectValue(source);
  const type = text(plan.type, 30);
  const title = text(plan.title, 80);
  if (!PLAN_TYPES.has(type) || !title) return null;
  const members = Array.isArray(couple && couple.members) ? couple.members : [];
  return {
    type,
    title,
    detail: text(plan.detail, 5000),
    status: STATUSES.has(plan.status) ? plan.status : "todo",
    assigneeOpenids: type === "task" && Array.isArray(plan.assigneeOpenids)
      ? plan.assigneeOpenids.filter((id) => members.includes(id)).slice(0, 2)
      : [],
    startAt: ["event", "trip", "anniversary"].includes(type) ? date(plan.startAt) : null,
    endAt: ["task", "trip"].includes(type) ? date(plan.endAt) : null,
    rewardPoints: type === "task" ? Math.round(number(plan.rewardPoints, 0, 100000)) : 0,
    payload: planPayload(type, plan.payload),
    createdBy: openid
  };
}

module.exports = { normalizeRestoredRecord, normalizeRestoredPlan };
