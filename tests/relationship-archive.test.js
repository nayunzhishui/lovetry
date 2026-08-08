const test = require("node:test");
const assert = require("node:assert/strict");
const {
  archiveAccessId,
  resolveArchivedCouple,
  validArchivedCouple
} = require("../couple-miniprogram/cloudfunctions/_shared/archive-access");

function fakeDb({ access = null, couple = null } = {}) {
  const writes = [];
  return {
    writes,
    collection(name) {
      return {
        doc() {
          return {
            async get() {
              if (name === "relationship_archives") {
                if (!access) throw new Error("not found");
                return { data: access };
              }
              if (name === "couples") {
                if (!couple) throw new Error("not found");
                return { data: couple };
              }
              throw new Error("not found");
            },
            async set({ data }) { writes.push({ name, data }); }
          };
        }
      };
    }
  };
}

test("历史档案访问 ID 按用户和旧空间稳定隔离", () => {
  assert.equal(archiveAccessId("u1", "c1"), archiveAccessId("u1", "c1"));
  assert.notEqual(archiveAccessId("u1", "c1"), archiveAccessId("u2", "c1"));
  assert.notEqual(archiveAccessId("u1", "c1"), archiveAccessId("u1", "c2"));
});

test("只有旧空间原成员可以访问 archived couple", () => {
  const couple = { _id: "c1", status: "archived", members: ["u1", "u2"] };
  assert.equal(validArchivedCouple(couple, "u1"), true);
  assert.equal(validArchivedCouple(couple, "u3"), false);
  assert.equal(validArchivedCouple({ ...couple, status: "active" }, "u1"), false);
});

test("旧 archived couple 可懒迁移独立档案权利记录", async () => {
  const couple = { _id: "c1", status: "archived", members: ["u1", "u2"], spaceName: "旧空间" };
  const db = fakeDb({ couple });
  assert.equal(await resolveArchivedCouple(db, "u1", "c1"), couple);
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].name, "relationship_archives");
  assert.equal(db.writes[0].data.ownerOpenid, "u1");
});

test("档案权利与请求用户不匹配时拒绝读取", async () => {
  const couple = { _id: "c1", status: "archived", members: ["u1", "u2"] };
  const db = fakeDb({ access: { ownerOpenid: "u2", coupleId: "c1" }, couple });
  assert.equal(await resolveArchivedCouple(db, "u1", "c1"), null);
  assert.equal(db.writes.length, 0);
});
