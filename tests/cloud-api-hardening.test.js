const test = require("node:test");
const assert = require("node:assert/strict");

function loadApi(t, responder) {
  const calls = [];
  global.wx = {
    cloud: {
      callFunction({ name, data }) {
        calls.push({ name, data });
        return Promise.resolve({ result: responder(name, data, calls.length) });
      }
    }
  };
  const path = require.resolve("../couple-miniprogram/miniprogram/services/cloudApi");
  delete require.cache[path];
  const api = require(path);
  t.after(() => { delete global.wx; delete require.cache[path]; });
  return { api, calls };
}

test("备份恢复客户端会自动续跑 checkpoint 直到完成", async (t) => {
  let dashboardCalls = 0;
  const { api, calls } = loadApi(t, (name, data) => {
    assert.equal(name, "dashboard");
    assert.equal(data.action, "import");
    dashboardCalls += 1;
    if (dashboardCalls === 1) return { ok: true, data: { counts: { records: 25, plans: 25, skipped: 0 }, restore: { hasMore: true, status: "running" } } };
    return { ok: true, data: { counts: { records: 40, plans: 30, skipped: 2 }, restore: { hasMore: false, status: "completed" } } };
  });
  const counts = await api.importData({ schemaVersion: 1 });
  assert.deepEqual(counts, { records: 40, plans: 30, skipped: 2 });
  assert.equal(calls.length, 2);
});

test("删除记录必须把当前版本发送给服务端", async (t) => {
  const { api, calls } = loadApi(t, (name, data) => ({ ok: true, data: { recordId: data.recordId } }));
  await api.deleteRecord("record-a", 7);
  assert.equal(calls[0].name, "records");
  assert.equal(calls[0].data.action, "delete");
  assert.equal(calls[0].data.recordId, "record-a");
  assert.equal(calls[0].data.version, 7);
});

test("历史档案 API 使用独立只读动作", async (t) => {
  const { api, calls } = loadApi(t, (name, data) => {
    if (name === "couple") return { ok: true, data: { archives: [{ _id: "old-couple" }] } };
    return { ok: true, data: { exportData: { readOnlyArchive: true } } };
  });
  assert.deepEqual(await api.listRelationshipArchives(), [{ _id: "old-couple" }]);
  assert.deepEqual(await api.exportArchivedData("old-couple"), { readOnlyArchive: true });
  assert.equal(calls[0].data.action, "listArchives");
  assert.equal(calls[1].data.action, "archiveExport");
});
