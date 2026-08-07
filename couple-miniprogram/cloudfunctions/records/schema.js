const REACTION_VALUES = new Set(["seen", "hug", "cheer"]);
const REPAIR_STATUSES = new Set(["noted", "preparing", "talked", "later"]);
const POMODORO_RESULTS = new Set(["completed", "interrupted"]);

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

function textList(value, maxItems = 8, maxLength = 30) {
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function reactionMap(existingPayload) {
  const source = objectValue(objectValue(existingPayload).reactionsByOpenid);
  return Object.entries(source).reduce((result, [openid, reaction]) => {
    if (openid && REACTION_VALUES.has(reaction)) result[text(openid, 100)] = reaction;
    return result;
  }, {});
}

function withReactions(payload, existingPayload) {
  const reactionsByOpenid = reactionMap(existingPayload);
  return Object.keys(reactionsByOpenid).length ? { ...payload, reactionsByOpenid } : payload;
}

function sanitizeRecordMetrics(type, input) {
  const metrics = objectValue(input);
  if (type === "sleep" || type === "game") {
    const durationMinutes = Math.round(boundedNumber(metrics.durationMinutes, 1, 1440, 0));
    return durationMinutes ? { durationMinutes } : {};
  }
  if (type === "pomodoro") {
    const plannedMinutes = Math.round(boundedNumber(metrics.plannedMinutes, 1, 240, 0));
    const durationMinutes = Math.round(boundedNumber(metrics.durationMinutes, 1, 240, 0));
    return {
      ...(plannedMinutes ? { plannedMinutes } : {}),
      ...(durationMinutes ? { durationMinutes } : {}),
      completed: metrics.completed === true
    };
  }
  return {};
}

function sanitizeRecordPayload(type, input, existingPayload) {
  const payload = objectValue(input);
  if (type === "moment") return withReactions({}, existingPayload);
  if (type === "mood") {
    return withReactions({
      level: Math.round(boundedNumber(payload.level, 1, 5, 3)),
      tags: textList(payload.tags, 8, 30)
    }, existingPayload);
  }
  if (type === "conflict") {
    const repairStatus = REPAIR_STATUSES.has(payload.repairStatus) ? payload.repairStatus : "noted";
    return {
      feelings: text(payload.feelings, 1000),
      needs: text(payload.needs, 1000),
      communication: text(payload.communication, 1600),
      agreement: text(payload.agreement || payload.result, 1600),
      satisfaction: Math.round(boundedNumber(payload.satisfaction, 1, 10, 5)),
      repairStatus
    };
  }
  if (type === "outing") {
    const amount = payload.amount === null || payload.amount === undefined || payload.amount === ""
      ? null
      : Math.round(boundedNumber(payload.amount, 0, 100000000, 0) * 100) / 100;
    return withReactions({
      category: text(payload.category, 40),
      location: text(payload.location, 120),
      amount,
      rating: Math.round(boundedNumber(payload.rating, 1, 5, 3))
    }, existingPayload);
  }
  if (type === "sleep") {
    return { quality: Math.round(boundedNumber(payload.quality, 1, 5, 3)) };
  }
  if (type === "period") {
    return { flow: text(payload.flow, 20) };
  }
  if (type === "intimacy") {
    return {
      protection: text(payload.protection, 20),
      comfort: text(payload.comfort, 20)
    };
  }
  if (type === "game") {
    return { participants: text(payload.participants, 200) };
  }
  if (type === "pomodoro") {
    return {
      phase: "focus",
      result: POMODORO_RESULTS.has(payload.result) ? payload.result : "interrupted"
    };
  }
  return {};
}

module.exports = { sanitizeRecordMetrics, sanitizeRecordPayload };
