const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  membershipId,
  isMembershipUsable,
  isCoupleUsable,
  findMineViaMembership
} = require("../couple-miniprogram/cloudfunctions/records/membership");

const CLOUD_FUNCTIONS_WITH_COPY = ["records", "rewards", "plans", "media", "dashboard", "notifications"];

function readCopy(name) {
  return fs.readFileSync(
    path.join(__dirname, "..", "couple-miniprogram", "cloudfunctions", name, "membership.js"),
    "utf8"
  );
}

// 简易内存版数据库桩：只实现 membership 快路径用到的 doc/where 查询，并记录访问轨迹
function fakeDb({ memberships = {}, couples = {}, whereResult = [] } = {}) {
  const log = [];
  return {
    log,
    command: { neq: (value) => ({ $neq: value }) },
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              log.push(`doc:${name}:${id}`);
              const store = name === "memberships" ? memberships : couples;
              if (!(id in store)) {
                const error = new Error(`document.get:fail document with _id ${id} does not exist`);
                error.errCode = -502004;
                throw error;
              }
              return { data: store[id] };
            }
          };
        },
        where() {
          log.push(`where:${name}`);
          return {
            limit() {
              return { async get() { return { data: whereResult }; } };
            }
          };
        }
      };
    }
  };
}

test("六个云函数目录内的 membership.js 拷贝内容保持一致", () => {
  const reference = readCopy(CLOUD_FUNCTIONS_WITH_COPY[0]);
  for (const name of CLOUD_FUNCTIONS_WITH_COPY.slice(1)) {
    assert.equal(readCopy(name), reference, `cloudfunctions/${name}/membership.js 与 records 拷贝不一致`);
  }
});

test("membershipId 与 couple 云函数使用同一哈希主键算法", () => {
  const openid = "openid-demo";
  const expected = crypto.createHash("sha256").update(openid).digest("hex").slice(0, 32);
  assert.equal(membershipId(openid), expected);
  assert.equal(membershipId(openid).length, 32);
  // couple/index.js 的实现必须保持同一算法，否则快路径永远 miss
  const coupleSource = fs.readFileSync(
    path.join(__dirname, "..", "couple-miniprogram", "cloudfunctions", "couple", "index.js"),
    "utf8"
  );
  assert.ok(coupleSource.includes('createHash("sha256").update(openid).digest("hex").slice(0, 32)'));
});

test("membership 与 couple 校验只接受活跃且包含本人的数据", () => {
  assert.equal(isMembershipUsable({ openid: "a", coupleId: "c1", status: "active" }, "a"), true);
  assert.equal(isMembershipUsable({ openid: "b", coupleId: "c1", status: "active" }, "a"), false);
  assert.equal(isMembershipUsable({ openid: "a", coupleId: "c1", status: "archived" }, "a"), false);
  assert.equal(isMembershipUsable({ openid: "a", status: "active" }, "a"), false);
  assert.equal(isMembershipUsable(null, "a"), false);

  assert.equal(isCoupleUsable({ status: "active", members: ["a", "b"] }, "a"), true);
  assert.equal(isCoupleUsable({ status: "archived", members: ["a", "b"] }, "a"), false);
  assert.equal(isCoupleUsable({ status: "active", members: ["b"] }, "a"), false);
  assert.equal(isCoupleUsable({ status: "active" }, "a"), false);
  assert.equal(isCoupleUsable(null, "a"), false);
});

test("memberships 命中时走 O(1) 快路径，不再触发 couples 条件查询", async () => {
  const openid = "openid-a";
  const db = fakeDb({
    memberships: { [membershipId(openid)]: { openid, coupleId: "c1", status: "active" } },
    couples: { c1: { status: "active", members: [openid, "openid-b"], spaceName: "小空间" } }
  });
  const couple = await findMineViaMembership(db, openid);
  assert.equal(couple._id, "c1");
  assert.equal(couple.spaceName, "小空间");
  assert.ok(!db.log.some((entry) => entry.startsWith("where:")), "快路径命中时不应回退到 where 查询");
});

test("memberships 未建立或文档不存在时回退到 couples 条件查询", async () => {
  const openid = "openid-a";
  const db = fakeDb({ whereResult: [{ _id: "c2", status: "active", members: [openid] }] });
  const couple = await findMineViaMembership(db, openid);
  assert.equal(couple._id, "c2");
  assert.ok(db.log.includes("where:couples"));
});

test("membership 指向已归档或不含本人的空间时同样回退，且回退无结果返回 null", async () => {
  const openid = "openid-a";
  const archivedDb = fakeDb({
    memberships: { [membershipId(openid)]: { openid, coupleId: "c1", status: "active" } },
    couples: { c1: { status: "archived", members: [openid] } },
    whereResult: [{ _id: "c3", status: "active", members: [openid] }]
  });
  const recovered = await findMineViaMembership(archivedDb, openid);
  assert.equal(recovered._id, "c3");
  assert.ok(archivedDb.log.includes("where:couples"));

  const emptyDb = fakeDb({});
  assert.equal(await findMineViaMembership(emptyDb, openid), null);
});
