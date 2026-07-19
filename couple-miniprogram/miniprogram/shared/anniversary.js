function parseDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function dateInYear(year, month, day) {
  if (month === 2 && day === 29) {
    const leapDay = new Date(year, 1, 29);
    if (leapDay.getMonth() !== 1) return new Date(year, 1, 28);
    return leapDay;
  }
  const value = new Date(year, month - 1, day);
  return value.getMonth() === month - 1 && value.getDate() === day ? value : null;
}

function formatLocalDate(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function nextAnniversary(sourceDate, now = new Date()) {
  const parts = parseDateParts(sourceDate);
  if (!parts || Number.isNaN(now.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let candidate = dateInYear(today.getFullYear(), parts.month, parts.day);
  if (!candidate) return null;
  if (candidate < today) candidate = dateInYear(today.getFullYear() + 1, parts.month, parts.day);
  return {
    date: formatLocalDate(candidate),
    daysRemaining: Math.round((candidate.getTime() - today.getTime()) / 86400000)
  };
}

module.exports = { nextAnniversary };
