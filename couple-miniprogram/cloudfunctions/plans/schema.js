function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function boundedNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
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

function sanitizePlanPayload(type, input) {
  const payload = objectValue(input);
  if (type === "task") {
    return { checklist: checklist(payload.checklist) };
  }
  if (type === "event") return {};
  if (type === "menu") {
    return {
      category: text(payload.category, 40),
      preference: Math.round(boundedNumber(payload.preference, 1, 5, 3)),
      tags: textList(payload.tags, 8, 30)
    };
  }
  if (type === "trip") {
    return {
      budget: Math.round(boundedNumber(payload.budget, 0, 100000000, 0) * 100) / 100,
      itinerary: textList(payload.itinerary, 30, 120),
      checklist: checklist(payload.checklist)
    };
  }
  if (type === "anniversary") {
    return {
      repeatYearly: payload.repeatYearly !== false,
      reminderDays: Math.round(boundedNumber(payload.reminderDays, 0, 30, 3))
    };
  }
  return {};
}

module.exports = { sanitizePlanPayload };
