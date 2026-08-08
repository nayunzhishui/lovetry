const VISIBILITIES = Object.freeze({
  PRIVATE: "private",
  COUPLE: "couple"
});

const RECORD_TYPES = Object.freeze({
  MOMENT: "moment",
  MOOD: "mood",
  CONFLICT: "conflict",
  OUTING: "outing",
  SLEEP: "sleep",
  PERIOD: "period",
  INTIMACY: "intimacy",
  GAME: "game",
  POMODORO: "pomodoro"
});

const PLAN_TYPES = Object.freeze({
  TASK: "task",
  EVENT: "event",
  MENU: "menu",
  TRIP: "trip",
  ANNIVERSARY: "anniversary"
});

// slider 的 activeColor/backgroundColor 不支持 CSS 变量，只能绑定常量色值
const SLIDER_COLORS = Object.freeze({
  active: "#C49A4A",
  altActive: "#738E78",
  track: "#D6DFDC"
});

const ERROR_CODES = Object.freeze({
  INVALID_RECORD: "INVALID_RECORD",
  INVALID_TIME: "INVALID_TIME",
  INVALID_REWARD: "INVALID_REWARD",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  NO_PERMISSION: "NO_PERMISSION"
});

module.exports = {
  ERROR_CODES,
  PLAN_TYPES,
  RECORD_TYPES,
  SLIDER_COLORS,
  VISIBILITIES
};
