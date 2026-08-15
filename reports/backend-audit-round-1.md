# 食光 FoodTime 后端审查报告（Round 1）

- **项目路径**：`/Users/a1234/WorkBuddy/2026-08-12-19-59-06/foodtime-xianzhi`
- **后端技术栈**：Node 原生 `node:http`（`src/server.js`，1569 行）+ `better-sqlite3`（本地）/ `sql.js`（EdgeOne 无原生模块模式）+ 纯 JS 领域服务（`foods/activities/domain/households/users/agent/...`）
- **审查范围**：食材 handle/restore、CRUD/搜索/批量、活动日志、认证与会话、家庭管理、AI 助手/转录、访问令牌、SQL 注入与错误处理、状态码正确性
- **审查方法**：
  1. 全量静态代码审查（`src/server.js` 路由层 + 各 service 模块）
  2. **真实路由层端到端 HTTP 验证**：以隔离配置（`FRIDGE_TRACKER_CONFIG` / `FRIDGE_EDGEONE`）加载真实 `server.js`，在空闲端口起服务，逐接口模拟前端调用（登录、食材增删改/handle/restore、批量、活动、令牌、家庭邀请/接受/移除、展示帧、转录、流式对话等）
  3. 既有 `node --test test/*.test.js` 92 用例回归
- **关于线上预览**：`http://127.0.0.1:8790/`（返回 502）与本地实际在跑的 `:8788`（200）使用的是旧快照/独立 DB，且以 `admin / fridge-demo` 登录返回 401——即线上实例与 `data/fridge_v2.sqlite` 不是同一库（属部署/数据状态问题，非 src 代码 bug）。因此本轮改用**隔离实例**做接口验证，并在报告中单列说明。

---

## 一、发现汇总

| 编号 | 位置 | 优先级 | 现象 | 根因 | 状态 |
| --- | --- | --- | --- | --- | --- |
| **B-1** | `src/server.js` `initializeApp()` 的 `IS_EDGEONE` 快照恢复分支（约 L96–113） | **P0 阻塞** | 部署环境（EdgeOne 快照恢复）下，食材「创建 / 吃掉·做菜·丢弃 / 恢复」全部 500；错误为 `table food_items has no column named unit_price` / `handled_at` | 从 Blob 快照 `createDatabase(snapshot)` 恢复后**未调用 `initializeDatabase()`**，结构迁移（补 `unit_price`/`handled_at`/`handled_by_user_id`/`handled_action`/`household_id` 等列）只在 `:memory:` 与文件分支执行，快照分支漏掉 | ✅ 已修复 |
| B-2 | `src/foodTools.js` `listFoodFields.status` 枚举（约 L23） | P3 优化 | AI 助手（list_items 工具）无法按 `handled` 状态检索「已处理」物品 | 枚举为 `["expired","expiring","normal"]`，缺 `"handled"`；而 `foodService.searchFoodItems` 本身支持 `handled` | 建议（未强制改，避免改变 Agent 默认检索行为） |
| B-3 | 线上预览实例 `:8788`/`:8790` 登录失败 | P3 观察 | `admin / fridge-demo` 返回 401，与 `data/fridge_v2.sqlite` 中可验证为 `fridge-demo` 的密码哈希不一致 | 运行的预览进程绑定的是旧快照/独立内存库，未使用本地 `data/fridge_v2.sqlite`（部署/数据状态问题，**非 src 代码缺陷**） | 观察项 |

> **P0/P1/P2 结论**：本轮发现 **1 个 P0**（B-1，已修复），**0 个 P1**，**0 个 P2**。其余为重点路径的「验证通过」记录与 2 条 P3 观察/建议。92 个既有用例全部通过，未破坏任何测试。

---

## 二、重点路径验证（确认正确，非 bug）

以下均通过真实 `server.js` 路由层 HTTP 调用验证（隔离实例，端口 8795）：

| 路径 | 验证结果 |
| --- | --- |
| `POST /api/foods/:id/handle` `{action:"eat"\|"cook"\|"discard"}` | ✅ 200，返回 `{ok:true,item:{...handled:true,handledAction:"eat",handledBy,handledAt}}`；`action` 非法/缺失 → 400；不存在的 id → 404（**household 隔离生效**）；重复处理幂等 |
| `POST /api/foods/:id/restore` | ✅ 200，返回 `handled:false, handledAction:null`；活动日志记录 `food_restored` |
| 活动日志 `recordFood` 映射 | ✅ `food_created / food_updated / food_deleted / food_handled / food_restored` 五种类型齐全，`ACTIVITY_TYPES` 校验通过，detail/metadata 正确 |
| `GET/POST /api/foods`、`PATCH /api/foods/:id`、`DELETE /api/foods/:id` | ✅ 增改删返回字段完整；PATCH 仅改部分字段（`expiresOn` 由 `startDate+shelfLifeDays` 重算正确） |
| `POST /api/foods/batch`（`delete` / `update_expiry`） | ✅ 批量删除/改期返回 `{ok:true,count,results}`；`ids` 缺失/非法 → 400（由 `normalizeBatchIds` 拦截，不会 500） |
| 认证与会话 | ✅ 登录/注册/登出/`me` 正确；未登录调用受保护接口 → 401；`requireUser` 守卫齐全 |
| 家庭管理 | ✅ 邀请创建/查看/接受（含 disposable household 校验）、成员移除（owner 守卫）、退出——状态码与返回字段均正确 |
| 访问令牌 | ✅ 创建（返回明文 token 仅一次）/列举/吊销（404 当不存在）正确 |
| AI 助手 | ✅ 会话增删查、无配置时 `sendMessage` → 503（友好文案）、流式 `messages/stream` 错误以 ndjson `{"type":"error",...status:404}` 干净返回（不崩溃）、转录无 ASR 配置 → 503 |
| 展示帧 | ✅ `/api/display/preview`（HTML 200）、`/api/display/frame.png`（PNG 200）正常 |
| SQL 注入 | ✅ 全量参数化（`prepare(...).get/run/all(...)` 绑定）；`searchFoodItems` 的 keyword 经 `ESCAPE '\'` 转义后作为绑定参数，列名均为硬编码常量；未发现任何拼接用户输入的 SQL |
| 错误处理 | ✅ `handleRequest` 统一 `try/catch`：`error.statusCode || 400` 映射状态码，仅向客户端返回 `error.message`（**不泄露堆栈**）；堆栈仅 `console.error` 落服务端日志 |
| 状态码正确性 | ✅ 资源不存在 404、权限不足 403、参数错误 400、未配置 503，均符合预期 |

---

## 三、Bug 详情

### [B-1] P0 · EdgeOne 快照恢复后缺失表结构迁移 → 食材写操作在部署环境 500

- **位置**：`src/server.js` `initializeApp()`，`IS_EDGEONE` 为真且存在 Blob 快照时的恢复分支（原 L96–106）。
- **现象**：部署实例从 Blob 恢复旧快照后，任意食材「创建 / 吃掉·做菜·丢弃 / 恢复」接口返回 500，核心错误：
  - `table food_items has no column named unit_price`
  - 或 `table food_items has no column named handled_at`
- **根因**：`initializeDatabase()` 内包含 `food_items`（`unit_price`/`handled_at`/`handled_by_user_id`/`handled_action`/`household_id`）与 `device_pairing_codes`、`users` 等表结构的向后迁移。但该函数**只在 `:memory:` 分支与本地文件分支被调用**；`IS_EDGEONE` 的「从快照恢复」分支（`db = await createDatabase(snapshot)`）恢复后**直接跳过** `initializeDatabase()`。因此当部署快照的 schema 早于当前代码（缺上述列）时，所有带新列的写入（食材创建/handle/restore）全部失败。这正是任务重点强调的食材 handle/restore 路由在生产环境会「返回 500」的真实根因。
- **修复**：将 `initializeDatabase()` 的调用从 `:memory:` 分支内提到 `IS_EDGEONE` 块末尾、两个分支之后统一执行（`src/server.js` L111）。`initializeDatabase()` 本身完全幂等（`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + 数据修正），在「已是最新结构」的数据库上重复执行安全无副作用；对旧快照则补齐缺失列。
- **优先级**：P0（阻塞全部食材写/处理/恢复）
- **状态**：✅ 已修复
- **验证**：
  1. 用旧 schema（缺 `unit_price`/`handled_at`）建库 → 执行与 `initializeDatabase()` 完全一致的 ALTER → 食材 `INSERT`（带 `unit_price`）与 `UPDATE`（带 `handled_at`）均成功（`/tmp/verify_migration.cjs` 输出 `MIGRATION VERIFICATION: PASSED`）。
  2. 既有 92 用例全部通过（`node --test test/*.test.js` → `# pass 92 # fail 0`）。
  3. 隔离实例 `server.js` 正常启动并完成登录、食材 create/handle/restore 全流程。

```javascript
// src/server.js —— initializeApp() 修复后（节选）
if (IS_EDGEONE) {
  console.log("initializing app; blob persistence:", hasBlobCredentials());
  const snapshot = await loadSnapshot();
  if (snapshot && snapshot.byteLength > 0) {
    db = await createDatabase(snapshot);
    console.log("restored db from snapshot; size:", snapshot.length);
  } else {
    db = await createDatabase(":memory:");
    console.log("started with in-memory db");
  }
  // 关键修复：从 Blob 快照恢复后也必须执行表结构迁移。否则旧快照（缺少
  // unit_price / handled_at / household_id 等列）会让食材创建、处理、恢复等
  // 写操作在部署环境直接 500。initializeDatabase 本身是幂等的
  // （CREATE IF NOT EXISTS + ALTER IF NOT EXISTS + 数据修正），在已是最新结构的
  // 数据库上重复执行是安全的。
  initializeDatabase();
} else {
  const databasePath = path.resolve(ROOT, config.databasePath);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const Database = require("better-sqlite3");
  db = new Database(databasePath);
  initializeDatabase();
}
```

### [B-2] P3 · AI 工具 `status` 枚举缺 `"handled"`

- **位置**：`src/foodTools.js` `listFoodFields.status`（约 L23）。
- **现象**：Agent 的 `list_items` 工具 schema 中 `status` 为 `["expired","expiring","normal"]`，缺少 `"handled"`，导致无法用自然语言检索「已吃掉/已处理」的物品。
- **根因**：枚举未与 `foodService.searchFoodItems` 实际支持的 `handled` 状态对齐（`FOOD_STATUSES` 含 `handled`）。
- **优先级**：P3（功能增强，非阻断）
- **状态**：建议项，未强制修改（避免改变 Agent 默认检索范围；如确认需要检索已处理物品，补 `"handled"` 即可，service 层已支持）。

### [B-3] P3 · 线上预览实例登录失败（部署/数据状态，非代码问题）

- **位置**：运行中的预览进程（`:8788` / `:8790`）。
- **现象**：`admin / fridge-demo` 登录返回 401；但 `data/fridge_v2.sqlite` 中 admin 密码哈希经验证确实对应 `fridge-demo`。
- **根因**：当前在跑的预览进程绑定的是旧快照 / 独立内存库，未使用本地 `data/fridge_v2.sqlite`，属部署数据状态不一致，**非 src 代码缺陷**（认证/密码校验代码本身正确，隔离实例已验证登录、handle/restore 全链路通过）。
- **优先级**：P3 观察
- **状态**：观察项，建议部署前确保预览进程指向正确数据库并重新 seed。

---

## 四、测试与回归结论

- **修复前基线**：`node --test test/*.test.js` → 92 pass / 0 fail。
- **修复后**：`node --test test/*.test.js` → **92 pass / 0 fail**（使用 `/Users/a1234/.workbuddy/binaries/node/versions/22.22.2/bin/node`）。B-1 的修复仅作用于 `IS_EDGEONE` 快照恢复分支，既有的 `createTestDatabase()`（helpers.js）测试路径不受影响。
- **端到端路由验证**：通过加载真实 `server.js` 的隔离实例，覆盖登录、食材 CRUD/handle/restore、批量、活动、令牌、家庭邀请/接受/移除、展示帧、转录、流式对话等，关键路径状态与返回字段均符合前端契约。

---

## 五、总结

- **发现 bug 数量**：1（P0 × 1；P1 × 0；P2 × 0；P3 × 2 观察/建议）
- **已修复数量**：1（B-1 P0）
- **剩余数量**：0（P0/P1/P2）；P3 建议 2 条（B-2 枚举增强、B-3 部署数据状态）
- **核心结论**：食材 handle/restore 路由、CRUD/批量、活动日志、认证会话、家庭管理、AI 助手、访问令牌等**重点路径经真实路由层验证均正确**（含参数校验、household 隔离、活动日志类型齐全、返回字段完整、状态码正确、无 SQL 注入、错误不泄露堆栈）。唯一阻断级缺陷 B-1 位于「EdgeOne 快照恢复未执行表结构迁移」，会导致生产环境食材创建/处理/恢复 500，已修复并通过回归与迁移验证。
