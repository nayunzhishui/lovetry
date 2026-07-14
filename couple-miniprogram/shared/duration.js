const { ERROR_CODES } = require("./constants");
const { DomainError } = require("./errors");

const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 24 * 60;

function parseClock(value) {
  if (typeof value !== "string" || !CLOCK_PATTERN.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function calculateDurationMinutes(startAt, endAt) {
  const startClock = parseClock(startAt);
  const endClock = parseClock(endAt);
  if (startClock !== null && endClock !== null) {
    const sameDayDuration = endClock - startClock;
    return sameDayDuration > 0
      ? sameDayDuration
      : sameDayDuration + MINUTES_PER_DAY;
  }

  const startTime = new Date(startAt).getTime();
  const endTime = new Date(endAt).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    throw new DomainError(ERROR_CODES.INVALID_TIME, "起止时间无效");
  }

  return Math.round((endTime - startTime) / 60000);
}

module.exports = { calculateDurationMinutes };
