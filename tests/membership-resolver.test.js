const test = require("node:test");
const assert = require("node:assert/strict");
const {
  membershipId,
  resolveActiveCouple
} = require("../couple-miniprogram/cloudfunctions/_shared/membership");

const command = { neq: (value) => ({ $neq: value }) };

function fakeDb({ membership = null, couplesById = {}, legacy = [] } = {}) {
  const writes = [];
  let legacyQueries = 0;
  return {
    writes,
    get legacyQueries() { return legacyQueries; },
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              if (name === "memberships") {
                if (!membership) throw new Error("not found");
                return { data: membership };
              }
              if (name === "couples") {
                if (!couplesById[id]) throw new Error("not found");
                return { data: couplesById[id] };
              }
              throw new Error("not found");
            },
            async set({ data }) {
              writes.push({ name, id, data });
            }
          };
        },
        where() {
          legacyQueries += 1;
          return {
            limit() {
              return { get: async () => ({ data: legacy }) };
            }
          };
        }
      };
    }
  };
}

test("active membership 是情侣空间事实源", async () => {
  const couple = { _id: "couple-a", members: ["user-a", "user-b"], status: "active" };
  const db = fakeDb({ membership: { openid: "user-a", coupleId: "couple-a", status: "active" }, couplesById: { "couple-a": couple }, legacy: [{ _id: "wrong", members: ["user-a"], status: "active" }] });
  assert.equal(await resolveActiveCouple(db, command, "user-a"), couple);
  assert.equal(db.legacyQueries, 0);
  assert.equal(db.writes.length, 0);
});

test("archived membership 不会被旧 couples.members 查询复活", async () => {
  const db = fakeDb({ membership: { openid: "user-a", coupleId: "old", status: "archived" }, legacy: [{ _id: "wrong", members: ["user-a"], status: "active" }] });
  assert.equal(await resolveActiveCouple(db, command, "user-a"), null);
  assert.equal(db.legacyQueries, 0);
  assert.equal(db.writes.length, 0);
});

test("无 membership 的旧项目会懒迁移到确定性 membership", async () => {
  const couple = { _id: "legacy-couple", members: ["user-a", "user-b"], status: "active" };
  const db = fakeDb({ legacy: [couple] });
  assert.equal(await resolveActiveCouple(db, command, "user-a"), couple);
  assert.equal(db.legacyQueries, 1);
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].name, "memberships");
  assert.equal(db.writes[0].id, membershipId("user-a"));
  assert.deepEqual({ ...db.writes[0].data, updatedAt: null }, {
    openid: "user-a",
    coupleId: "legacy-couple",
    status: "active",
    updatedAt: null
  });
});
