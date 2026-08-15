# 家庭成员邀请闭环 — 补全与验证总结

> 目标：补齐「生成邀请码 → 复制邀请码/注册链接 → 受邀人用链接注册并加入家庭」的完整闭环。
> 触发：用户在账户页已能生成邀请码，但注册端没有填写入口，导致闭环断裂（截图反馈）。

## 一、问题定位

- 账户页（`#createHouseholdInvite`）已能生成一次性邀请码（10 位、`HOUSEHOLD_INVITE_TTL_MS` 24h、单次使用）。
- 后端能力其实**已具备**：`POST /api/household/invites`（返回 `code` + `inviteUrl`）、`POST /api/household/invites/accept`（已登录用户接受）、`households.joinByInvite`。
- **断点**：注册页（`#registerForm`）没有「邀请码」输入框，也没有把 `?invite=` 链接接通到注册流程；用户只能手动记码、却无处填写 → 闭环无法完成。

## 二、本次补全内容

### 后端（src/server.js / src/households.js）
- 注册接口 `POST /api/auth/register` 新增可选字段 `invitationCode`：
  1. 携带时先 `inspectInvite` 校验（不存在/已用/过期 → 提前返回 400/410，避免建出孤立用户）；
  2. 用户创建后在外层事务内调用 `joinByInvite(user.id, code)`，将新用户并入邀请方家庭并标记邀请码已用；
  3. 返回体附带 `joinedHousehold:{id,name}`，前端据以提示「已加入「<家庭名>」」。
- `households.joinByInvite` 复用既有 `assertDisposableHousehold`：仅当新用户当前为「空且独占」的临时家庭时才可替换，避免误吞已有数据。
- 不破坏无邀请码注册：无 `invitationCode` 时仍创建独立家庭（向后兼容）。

### 前端（public/index.html / public/app.js / public/styles.css）
- 注册表单新增「邀请码（可选）」输入框 `#registerInvitationCode`。
- `initialize()` 启动时读取 `?invite=` 参数写入 `state.pendingInviteCode`；未登录时自动切到注册模式并回填邀请码（受邀人打开分享链接即直达注册且已填好码）。
- 注册提交携带 `invitationCode`（统一 `toUpperCase`），成功提示区分「已加入家庭 / 账号已创建」。
- 账户页邀请区新增两个按钮：
  - 「复制邀请码」`#copyHouseholdInviteCode` → 复制纯邀请码；
  - 「复制注册链接」`#copyHouseholdInvite` → 复制 `?invite=CODE` 链接（后端 `inviteUrl`）。
- 复制采用 `navigator.clipboard` + 非安全上下文降级 `execCommand` 兜底；均有 toast 反馈。
- 版本号 `?v=20260815-1` → `?v=20260815-2`（同步更新 `test/auth-ui.test.js` 断言）。

## 三、测试与回归结果

| 检查项 | 结果 |
|---|---|
| 邀请闭环专项（Playwright，execute-test-cases-invite.js） | **7/7 通过**（生成+展示 / 复制按钮 / 链接回填 / 注册加入家庭 / 已用码拒 / 无效码拒 / 复制反馈） |
| 单元测试 `node --test`（92 例） | **92/92 通过**（注册接口改动无回归） |
| Round 2 关键用例（18 例）/ Round 3 PM 复核（29 例） | 此前均已 18/18、29/29，未被本次改动影响 |

### 关键验证点（实测）
- 用 `?invite=CODE` 打开 → 注册表单可见且 `<input id=registerInvitationCode>` 值 == CODE。
- 用该码注册 → 进入工作台，`GET /api/household` 的 `members` 出现新成员（memberCount 由 1→2/3）。
- 同码二次注册 → HTTP 410 `invite_used`；伪造码 → HTTP 404 `invite_not_found`；均无孤立用户。
- 后端注册校验在事务内：校验不通过则整体回滚，不会留下半截用户。

## 四、部署就绪状态

- 部署产物已同步：`.edgeone/assets/` 已 `cp -R public/.`，含全部修复（版本 `20260815-2`、删除按钮、邀请闭环、AI 浮窗隐藏等），并通过内容比对校验。
- ⚠️ 已知阻塞（与上一轮一致）：`edgeone makers dev/deploy` 会触发 CLI 批量删除安全确认（6492 文件 > 阈值 50，需人工交互），沙箱非交互模式无法确认 → 真部署仍需你在本机交互终端手动执行，或先清理云函数构建缓存。预览可用应用自带 `http://127.0.0.1:8790/`。

## 五、结论

家庭成员邀请闭环已**端到端打通并可发布质量**：生成 → 复制邀请码/链接 → 链接直达注册回填 → 注册即加入家庭，异常码（已用/无效）均被正确拦截。建议下一步由你确认走 EdgeOne Makers 真部署（交互式）或在 8790 预览验收。
