const CONTEXT_TYPES = {
  moment: "生活日记",
  mood: "心情日记",
  conflict: "沟通复盘"
};
const HANDOFF_KEY = "lovetry_agent_handoff_v1";
const HANDOFF_MAX_AGE_MS = 30 * 60 * 1000;

function cleanText(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanMultiline(value, limit) {
  return String(value || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
}

function contextCandidate(record, openid) {
  if (!record || !record._id || !openid) return null;
  const owner = record.ownerOpenid || record.creatorOpenid;
  if (owner !== openid || !CONTEXT_TYPES[record.type]) return null;
  const payload = record.payload || {};
  const content = [
    record.title,
    record.content,
    payload.feelings,
    payload.needs,
    payload.communication,
    payload.agreement
  ].map((value) => cleanText(value, 400)).filter(Boolean).join(" · ");
  if (!content) return null;
  return {
    key: record._id,
    type: record.type,
    typeLabel: CONTEXT_TYPES[record.type],
    label: cleanText(record.title, 60) || CONTEXT_TYPES[record.type],
    preview: cleanText(content, 400)
  };
}

function contextPayload(candidate) {
  if (!candidate || !CONTEXT_TYPES[candidate.type]) return null;
  const content = cleanText(candidate.preview, 400);
  if (!content) return null;
  return {
    type: candidate.type,
    label: cleanText(candidate.label, 60) || CONTEXT_TYPES[candidate.type],
    content
  };
}

function createHandoffRepository(adapter, options = {}) {
  const now = typeof options.now === "function" ? options.now : Date.now;
  return {
    save(input) {
      const question = cleanMultiline(input && input.question, 400);
      const answer = cleanMultiline(input && input.answer, 1800);
      if (!answer) return false;
      try {
        adapter.set(HANDOFF_KEY, { version: 1, savedAt: now(), question, answer });
        return true;
      } catch (error) {
        return false;
      }
    },
    load() {
      try {
        const value = adapter.get(HANDOFF_KEY);
        if (!value || value.version !== 1 || !value.answer || now() - Number(value.savedAt || 0) > HANDOFF_MAX_AGE_MS) {
          adapter.remove(HANDOFF_KEY);
          return null;
        }
        return { question: cleanMultiline(value.question, 400), answer: cleanMultiline(value.answer, 1800) };
      } catch (error) {
        return null;
      }
    },
    clear() {
      try { adapter.remove(HANDOFF_KEY); return true; } catch (error) { return false; }
    }
  };
}

function handoffToConflictPatch(handoff) {
  if (!handoff || !handoff.answer) return null;
  const answer = cleanMultiline(handoff.answer, 700);
  return {
    title: "一次准备中的沟通",
    content: handoff.question ? `我想谈的事情：${handoff.question}` : "",
    communication: `AI 建议草稿（请核对并改成自己的话）：\n${answer}`,
    visibility: "private"
  };
}

module.exports = {
  contextCandidate,
  contextPayload,
  createHandoffRepository,
  handoffToConflictPatch
};
