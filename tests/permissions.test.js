const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateRecordAccess } = require("../couple-miniprogram/shared");

test("情侣空间之外的用户不能读写记录", () => {
  const access = evaluateRecordAccess({
    couple: { members: ["user-a", "user-b"] },
    record: {
      ownerOpenid: "user-a",
      visibility: "couple"
    },
    openid: "outsider"
  });

  assert.deepEqual(access, {
    isMember: false,
    canRead: false,
    canWrite: false
  });
});

test("私密记录只有情侣空间内的创建者可以读写", () => {
  const couple = { members: ["user-a", "user-b"] };
  const record = { ownerOpenid: "user-a", visibility: "private" };

  assert.deepEqual(
    evaluateRecordAccess({ couple, record, openid: "user-a" }),
    { isMember: true, canRead: true, canWrite: true }
  );
  assert.deepEqual(
    evaluateRecordAccess({ couple, record, openid: "user-b" }),
    { isMember: true, canRead: false, canWrite: false }
  );
});

test("共享记录允许伴侣查看但只允许创建者修改", () => {
  const couple = { members: ["user-a", "user-b"] };
  const record = { creatorOpenid: "user-a", visibility: "couple" };

  assert.deepEqual(
    evaluateRecordAccess({ couple, record, openid: "user-b" }),
    { isMember: true, canRead: true, canWrite: false }
  );
});
