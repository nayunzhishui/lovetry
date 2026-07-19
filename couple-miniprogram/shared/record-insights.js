function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(value) {
  const date = validDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shortDate(value) {
  const key = dateKey(value);
  return key ? `${Number(key.slice(5, 7))}.${Number(key.slice(8, 10))}` : "";
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function durationLabel(minutes) {
  const rounded = Math.round(Number(minutes) || 0);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (!hours) return `${rest} 分钟`;
  return rest ? `${hours}小时${rest}分` : `${hours} 小时`;
}

function clockLabel(minutes) {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
}

function clockMinutes(value, normalizeBedtime) {
  const date = validDate(value);
  if (!date) return null;
  let minutes = date.getHours() * 60 + date.getMinutes();
  if (normalizeBedtime && minutes < 12 * 60) minutes += 1440;
  return minutes;
}

function barRows(records, readValue, maxValue) {
  const rows = records
    .map((record) => ({
      key: record._id || `${record.type}:${record.startAt || record.createdAt}`,
      label: shortDate(record.startAt || record.createdAt),
      value: Number(readValue(record))
    }))
    .filter((item) => item.label && Number.isFinite(item.value) && item.value >= 0)
    .slice(0, 7)
    .reverse();
  const maximum = Number(maxValue) || Math.max(1, ...rows.map((item) => item.value));
  return rows.map((item) => ({
    ...item,
    valueText: String(Math.round(item.value * 10) / 10),
    width: Math.max(8, Math.round((item.value / maximum) * 100))
  }));
}

function moodInsight(records) {
  const valid = records.filter((record) => {
    const level = Number(record.payload && record.payload.level);
    return level >= 1 && level <= 5;
  }).slice(0, 7);
  if (!valid.length) return null;
  const mean = Math.round(average(valid.map((record) => Number(record.payload.level))) * 10) / 10;
  const tagCounts = {};
  valid.forEach((record) => (record.payload && record.payload.tags || []).forEach((tag) => {
    const label = String(tag || "").trim();
    if (label) tagCounts[label] = (tagCounts[label] || 0) + 1;
  }));
  const topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];
  return {
    eyebrow: "RECENT MOOD",
    title: "最近的心情线索",
    metrics: [
      { value: `${mean}/5`, label: "近 7 条平均" },
      { value: String(valid.length), label: "有效记录" },
      { value: topTag ? topTag[0] : "—", label: "常见标签" }
    ],
    bars: barRows(valid, (record) => record.payload.level, 5),
    unit: "心情程度",
    note: valid.length < 3 ? "继续记录几次后，更容易看见自己的阶段变化。" : "这是阶段性观察，不代表性格、诊断或伴侣造成了某种感受。"
  };
}

function outingInsight(records) {
  const valid = records.slice(0, 30);
  if (!valid.length) return null;
  const amounts = valid
    .map((record) => record.payload && record.payload.amount)
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const categoryCounts = {};
  valid.forEach((record) => {
    const category = String(record.payload && record.payload.category || "其他");
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });
  const top = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
  return {
    eyebrow: "OUR OUTINGS",
    title: "共同经历摘要",
    metrics: [
      { value: String(valid.length), label: "最近记录" },
      { value: amounts.length ? `¥${Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100) / 100}` : "—", label: "已填花费" },
      { value: top ? top[0] : "—", label: "最多类型" }
    ],
    bars: [],
    note: "花费只用于回顾共同生活，不用于比较谁付出更多。"
  };
}

function sleepInsight(records) {
  const valid = records.filter((record) => {
    const minutes = Number(record.metrics && record.metrics.durationMinutes);
    return minutes > 0 && minutes <= 24 * 60;
  }).slice(0, 7);
  if (!valid.length) return null;
  const durations = valid.map((record) => Number(record.metrics.durationMinutes));
  const bedtimes = valid.map((record) => clockMinutes(record.startAt, true)).filter(Number.isFinite);
  const wakeTimes = valid.map((record) => clockMinutes(record.endAt, false)).filter(Number.isFinite);
  const bedtimeMean = average(bedtimes);
  const deviation = bedtimes.length ? average(bedtimes.map((value) => Math.abs(value - bedtimeMean))) : 0;
  const regularity = bedtimes.length < 3 ? "待积累" : deviation <= 45 ? "较稳定" : deviation <= 90 ? "有些波动" : "波动较多";
  return {
    eyebrow: "SLEEP RHYTHM",
    title: "最近的睡眠节奏",
    metrics: [
      { value: durationLabel(average(durations)), label: "平均时长" },
      { value: bedtimes.length ? clockLabel(bedtimeMean) : "—", label: "平均入睡" },
      { value: wakeTimes.length ? clockLabel(average(wakeTimes)) : "—", label: "平均醒来" }
    ],
    bars: barRows(valid, (record) => Number(record.metrics.durationMinutes) / 60),
    unit: "时长 / 小时",
    note: `${regularity === "待积累" ? "至少记录 3 次后显示规律度" : `入睡时间${regularity}`}。这里只帮助回顾作息，不提供健康诊断。`
  };
}

function periodInsight(records) {
  const periods = records
    .map((record) => ({ ...record, start: validDate(record.startAt || record.createdAt), end: validDate(record.endAt) }))
    .filter((record) => record.start)
    .sort((a, b) => a.start - b.start)
    .filter((record, index, list) => index === 0 || dateKey(record.start) !== dateKey(list[index - 1].start));
  if (!periods.length) return null;
  const intervals = [];
  for (let index = 1; index < periods.length; index += 1) {
    const days = Math.round((periods[index].start - periods[index - 1].start) / 86400000);
    if (days >= 15 && days <= 60) intervals.push(days);
  }
  const durations = periods
    .map((record) => record.end ? Math.floor((record.end - record.start) / 86400000) + 1 : 1)
    .filter((days) => days >= 1 && days <= 14);
  const cycleDays = intervals.length >= 3 ? Math.round(median(intervals.slice(-6))) : 0;
  let estimate = "样本不足";
  if (cycleDays) {
    const next = new Date(periods[periods.length - 1].start);
    next.setDate(next.getDate() + cycleDays);
    estimate = dateKey(next);
  }
  return {
    eyebrow: "CYCLE NOTES",
    title: "周期记录摘要",
    metrics: [
      { value: cycleDays ? `${cycleDays} 天` : "—", label: "周期中位数" },
      { value: durations.length ? `${Math.round(average(durations) * 10) / 10} 天` : "—", label: "平均持续" },
      { value: estimate, label: "下次开始估算" }
    ],
    bars: intervals.slice(-7).map((value, index) => ({ key: `cycle-${index}`, label: `周期${index + 1}`, valueText: String(value), width: Math.max(8, Math.round(value / 60 * 100)) })),
    unit: "周期 / 天",
    note: cycleDays
      ? `基于最近 ${Math.min(intervals.length, 6)} 个有效周期的中位数估算；不代表排卵、避孕或医疗结论。`
      : `已有 ${intervals.length} 个有效周期，至少 3 个后才显示下次开始日估算。`
  };
}

function durationInsight(type, records) {
  const valid = records.filter((record) => Number(record.metrics && record.metrics.durationMinutes) > 0).slice(0, 7);
  if (!valid.length) return null;
  const minutes = valid.map((record) => Number(record.metrics.durationMinutes));
  const isGame = type === "game";
  return {
    eyebrow: isGame ? "PLAY TOGETHER" : "FOCUS NOTES",
    title: isGame ? "最近的共同游戏" : "最近的专注记录",
    metrics: [
      { value: String(valid.length), label: "最近次数" },
      { value: durationLabel(minutes.reduce((sum, value) => sum + value, 0)), label: "累计时长" },
      { value: durationLabel(average(minutes)), label: "平均每次" }
    ],
    bars: barRows(valid, (record) => Number(record.metrics.durationMinutes)),
    unit: "时长 / 分钟",
    note: isGame ? "保留一起玩的回忆，不按胜负或时长给关系打分。" : "专注数据只帮助安排时间，不用于评价效率或自律。"
  };
}

function buildRecordInsight(type, records) {
  const typed = (Array.isArray(records) ? records : []).filter((record) => record && record.type === type);
  if (type === "mood") return moodInsight(typed);
  if (type === "outing") return outingInsight(typed);
  if (type === "sleep") return sleepInsight(typed);
  if (type === "period") return periodInsight(typed);
  if (type === "game" || type === "pomodoro") return durationInsight(type, typed);
  return null;
}

module.exports = { buildRecordInsight, median };
