const { ERROR_CODES } = require("./constants");
const { DomainError } = require("./errors");

const TRANSACTION_TYPES = new Set(["earn", "spend"]);

function normalizeWallet(wallet = {}) {
  const normalized = {
    balance: Number(wallet.balance || 0),
    totalEarned: Number(wallet.totalEarned || 0),
    totalSpent: Number(wallet.totalSpent || 0)
  };
  if (Object.values(normalized).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new DomainError(ERROR_CODES.INVALID_REWARD, "钱包数据无效");
  }
  return normalized;
}

function applyRewardTransaction(wallet, command, processedIdempotencyKeys = []) {
  if (
    !command ||
    !TRANSACTION_TYPES.has(command.type) ||
    !Number.isSafeInteger(command.amount) ||
    command.amount <= 0 ||
    typeof command.sourceType !== "string" ||
    !command.sourceType ||
    typeof command.sourceId !== "string" ||
    !command.sourceId ||
    typeof command.idempotencyKey !== "string" ||
    !command.idempotencyKey
  ) {
    throw new DomainError(ERROR_CODES.INVALID_REWARD, "奖励流水参数无效");
  }

  const currentWallet = normalizeWallet(wallet);
  const processedKeys = new Set(processedIdempotencyKeys);
  if (processedKeys.has(command.idempotencyKey)) {
    return { applied: false, wallet: currentWallet, transaction: null };
  }

  const transaction = {
    type: command.type,
    amount: command.amount,
    sourceType: command.sourceType,
    sourceId: command.sourceId,
    idempotencyKey: command.idempotencyKey
  };

  if (command.type === "earn") {
    return {
      applied: true,
      wallet: {
        balance: currentWallet.balance + command.amount,
        totalEarned: currentWallet.totalEarned + command.amount,
        totalSpent: currentWallet.totalSpent
      },
      transaction
    };
  }

  if (currentWallet.balance < command.amount) {
    throw new DomainError(ERROR_CODES.INSUFFICIENT_BALANCE, "余额不足");
  }

  return {
    applied: true,
    wallet: {
      balance: currentWallet.balance - command.amount,
      totalEarned: currentWallet.totalEarned,
      totalSpent: currentWallet.totalSpent + command.amount
    },
    transaction
  };
}

module.exports = { applyRewardTransaction };
