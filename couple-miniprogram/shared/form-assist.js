const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const FORM_TEMPLATES = {
  record: {
    moment: [{ id: "small-memory", label: "一件小事", description: "快速记下共同经历", patch: {
      title: "今天的一件小事",
      content: "发生了什么：\n最想记住的细节：\n当时的感受："
    } }],
    mood: [{ id: "mood-checkin", label: "三步心情", description: "事件、感受和需要", patch: {
      title: "今天的心情",
      content: "发生了什么：\n我现在最明显的感受：\n我需要的是："
    } }],
    conflict: [{ id: "gentle-review", label: "温和复盘", description: "事实、感受、需要、下一步", patch: {
      title: "一次沟通复盘",
      content: "我观察到的事实：",
      feelings: "我感到：",
      needs: "我在意的需要：",
      communication: "我们已经尝试：",
      agreement: "下一步可以先："
    } }],
    outing: [{ id: "outing-memory", label: "约会回忆", description: "地点、亮点和下次想法", patch: {
      title: "今天的约会",
      content: "最喜欢的瞬间：\n下次还想："
    } }],
    sleep: [{ id: "sleep-note", label: "睡眠回顾", description: "睡前和醒后状态", patch: {
      title: "昨晚的睡眠",
      content: "入睡前的状态：\n夜间醒来情况：\n醒来后的感受："
    } }],
    period: [{ id: "body-note", label: "身体感受", description: "只记录，不做判断", patch: {
      title: "身体记录",
      content: "今天的身体感受：\n希望怎样照顾自己："
    } }],
    game: [{ id: "game-memory", label: "共同游戏", description: "进度、趣事和下次计划", patch: {
      title: "一起玩的游戏",
      content: "今天玩的内容：\n最开心的瞬间：\n下次想继续：",
      participants: "我们两个人"
    } }]
  },
  plan: {
    task: [{ id: "shared-chore", label: "共同家务", description: "带三步清单", patch: {
      title: "一起整理房间",
      detail: "完成后一起休息一下",
      checklistText: "分配区域\n开始整理\n一起检查"
    } }],
    event: [{ id: "weekend-date", label: "周末约会", description: "先把时间留出来", patch: {
      title: "周末约会",
      detail: "先留出时间，地点和内容之后一起决定"
    } }],
    menu: [{ id: "restaurant-candidate", label: "想吃的店", description: "餐厅候选模板", patch: {
      title: "想去吃的店",
      category: "餐厅",
      tagsText: "约会，待尝试"
    } }],
    trip: [{ id: "weekend-trip", label: "周末短途", description: "轻量行程与准备清单", patch: {
      title: "周末短途旅行",
      detail: "以放松为主，不把行程排得太满",
      itineraryText: "第一天 · 抵达与散步\n第二天 · 自由活动与返程",
      checklistText: "证件\n充电器\n常用药"
    } }],
    anniversary: [{ id: "meaningful-day", label: "重要日子", description: "建立年度提醒", patch: {
      title: "值得纪念的一天",
      detail: "留下一条属于我们的时间标记"
    } }]
  }
};

function safeScope(scope) {
  return String(scope || "")
    .replace(/[^a-z0-9:._-]/gi, "_")
    .slice(0, 100);
}

function createDraftRepository(adapter, options = {}) {
  const now = typeof options.now === "function" ? options.now : Date.now;
  const maxAgeMs = Number(options.maxAgeMs) > 0 ? Number(options.maxAgeMs) : DEFAULT_MAX_AGE_MS;
  const prefix = String(options.prefix || "lovetry_form_draft_v1:");
  const keyFor = (scope) => `${prefix}${safeScope(scope)}`;

  return {
    save(scope, data) {
      if (!safeScope(scope) || !data || typeof data !== "object") return false;
      try {
        adapter.set(keyFor(scope), { version: 1, savedAt: now(), data });
        return true;
      } catch (error) {
        return false;
      }
    },

    load(scope) {
      if (!safeScope(scope)) return null;
      try {
        const saved = adapter.get(keyFor(scope));
        if (!saved || saved.version !== 1 || !saved.data || typeof saved.data !== "object") return null;
        const savedAt = Number(saved.savedAt) || 0;
        if (!savedAt || now() - savedAt > maxAgeMs) {
          adapter.remove(keyFor(scope));
          return null;
        }
        return { data: saved.data, savedAt };
      } catch (error) {
        return null;
      }
    },

    clear(scope) {
      if (!safeScope(scope)) return false;
      try {
        adapter.remove(keyFor(scope));
        return true;
      } catch (error) {
        return false;
      }
    }
  };
}

function templatesFor(group, type) {
  const templates = FORM_TEMPLATES[group] && FORM_TEMPLATES[group][type];
  return Array.isArray(templates)
    ? templates.map((template) => ({ ...template, patch: { ...template.patch } }))
    : [];
}

function applyFormTemplate(form, templates, templateId) {
  const template = (Array.isArray(templates) ? templates : []).find((item) => item.id === templateId);
  return template ? { ...form, ...template.patch } : { ...form };
}

module.exports = { applyFormTemplate, createDraftRepository, templatesFor };
