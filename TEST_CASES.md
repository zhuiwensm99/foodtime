# 食光 FoodTime · Web 家庭端 全功能测试用例

> 版本：v1（Cycle 1 基线）  |  测试对象：`public/`（前端 16 视图）+ `src/server.js`（Node/SQLite 后端）
> 目标：覆盖**每一个功能点击必须有页面跳转/响应**、**无死页 / 无空白页**，并逐功能点给出可执行用例。
> 标记：🔴阻断 / 🟠高 / 🟡中 / 🟢低

---

## 0. 测试环境与前置条件

| 项 | 说明 |
|----|------|
| 本地服务 | `node src/server.js`，默认 `http://localhost:8790`（局域网 `http://192.168.2.235:8790`） |
| 浏览器 | Chrome / Safari 最新版；移动端用 DevTools 设备模拟（iPhone 12/13） |
| 账号 | 首次启动为 `local-demo` 演示模式，已预置家庭、成员、食材、活动数据 |
| 登录态 | 登录页 `email + password`；演示账号见登录页提示 |
| 判定基础 | 点击任意 `data-view-target` 后，对应 `data-view-panel` 必须获得 `.active` 并显示内容；调用 `data-new-food` / `data-start-display` 等自定义属性的元素必须有明确响应 |

**通用断言（适用于所有用例）**
- G1：点击导航项后，目标视图面板可见（`panel.classList.contains('active')` 且 `offsetParent !== null`），且页面无 JS 控制台报错。
- G2：任一视图在数据为空时显示**空状态 UI**（图标 + 文案 + 引导按钮），不得出现空白面板、未定义文本或脚本崩溃。
- G3：所有 `data-view-target` 取值必须存在同名的 `data-view-panel`，否则记为死链（阻断）。

---

## 1. 登录与注册（auth）

**TC-AUTH-01 🔴 登录页渲染**：进入 `/` 未登录时显示登录面板 `#loginPanel`，含邮箱/密码输入与登录按钮；控制台无报错。
**TC-AUTH-02 🔴 正确登录**：输入演示账号 → 点击登录 → 登录面板隐藏、顶栏 `#appTopbar` 显示、默认进入首页 `home`。
**TC-AUTH-03 🟠 错误密码**：输入错误密码 → 提示错误且停留在登录页，不进入应用。
**TC-AUTH-04 🟡 注册流程**：切换到注册 → 填写邮箱/密码/确认 → 提交 → 新账号创建并登录。
**TC-AUTH-05 🟡 表单校验**：邮箱格式非法 / 密码过短 → 行内校验提示，阻止提交。
**TC-AUTH-06 🟡 退出登录**：用户菜单 `#logoutMenu` → 退出 → 回到登录页，本地会话清除。
**TC-AUTH-07 🟢 登录态保持**：刷新页面后仍处于登录态（token/cookie 有效）。

---

## 2. 主导航与视图路由（核心 · 无死页）

> 路由机制：`setView(name)` → 切换 `data-view-panel` 的 `.active` 并调用对应 `render*()`。

| 导航项 | data-view-target | 期望面板 | 用例 |
|--------|------------------|----------|------|
| 首页 | home | home | TC-NAV-01 |
| 物品 | items | items | TC-NAV-02 |
| 台账 | ledger | ledger | TC-NAV-03 |
| 菜谱 | recipes | recipes | TC-NAV-04 |
| 预警 | alerts | alerts | TC-NAV-05 |
| 消息 | notifications | notifications | TC-NAV-06 |
| 账户管理（用户菜单） | account | account | TC-NAV-07 |
| Agent 设置（用户菜单） | agent-settings | agent-settings | TC-NAV-08 |
| 偏好设置（用户菜单） | preferences | preferences | TC-NAV-09 |
| 全屏显示（首页欢迎区） | display | display | TC-NAV-10 |

**TC-NAV-01 🔴** 点击主导航/移动底栏「首页」→ `home` 面板激活，展示 KPI、家人动态、临期清单。
**TC-NAV-02 🔴** 点击「物品」→ `items` 面板激活，展示库存表格与「添加物品」入口。
**TC-NAV-03 🔴** 点击「台账」→ `ledger` 面板激活，展示消费趋势图与分类统计。
**TC-NAV-04 🔴** 点击「菜谱」→ `recipes` 面板激活，展示菜谱卡片网格。
**TC-NAV-05 🔴** 点击「预警」→ `alerts` 面板激活，按临期/过期分组。
**TC-NAV-06 🔴** 点击顶部铃铛/移动端铃铛 → `notifications` 面板激活，展示通知列表；未读角标实时更新。
**TC-NAV-07 🔴** 用户菜单 → 「账户管理」→ `account` 面板激活，含当前账号、账户表单、家庭管理（成员/邀请/退出/设备配对）。
**TC-NAV-08 🔴** 用户菜单 → 「Agent 设置」→ `agent-settings` 面板激活，展示「我的 Agent」配置。
**TC-NAV-09 🔴** 用户菜单 → 「偏好设置」→ `preferences` 面板激活，展示提醒与同步开关。
**TC-NAV-10 🔴** 首页欢迎区「全屏显示」(`data-start-display`) → `display` 面板激活，进入展示模式。
**TC-NAV-11 🟠 死链校验**：遍历全部 `data-view-target`，断言每个均有同名 `data-view-panel`（CI 静态检查 + 手工）。
**TC-NAV-12 🟢 当前项高亮**：激活视图对应导航按钮 `.active` 且 `aria-current="page"`。
**TC-NAV-13 🟢 面包屑**：进入二级视图时面包屑正确显示层级（如 账户管理 → 成员详情）。

---

## 3. 首页 Home

**TC-HOME-01 🟠 KPI 展示**：页面顶部指标卡有数值（食材总数、临期数、本月浪费等），非 `NaN`/空。
**TC-HOME-02 🟠 家人动态**：`activities` 区列出近期动态；为空时显示空状态而非空白。
**TC-HOME-03 🟠 临期清单**：展示临期/过期食材；点击某条目 → 跳转 `items` 并定位/高亮该食材。
**TC-HOME-04 🟡 快捷操作**：欢迎区「手动添加物品」(`data-new-food`) → 打开食材编辑器；「管理全部」→ 跳 `items`；「全屏显示」→ 跳 `display`。
**TC-HOME-05 🟢 移动端**：移动首页顶栏显示品牌 logo + 铃铛 + 个人中心 chip，点击均有响应。

---

## 4. 物品管理 Items

**TC-ITEM-01 🔴 列表渲染**：`items` 表格显示全部食材，列含名称/分类/数量/状态/操作。
**TC-ITEM-02 🔴 新增（编辑器）**：点击「添加物品」/`data-new-food` → `#foodEditorOverlay` 打开，标题「添加物品」；填写名称/分类/到期 → 保存 → 列表新增且关闭编辑器。
**TC-ITEM-03 🔴 编辑**：列表中「编辑」→ 编辑器预填该食材数据，标题「编辑物品」；保存 → 数据更新。
**TC-ITEM-04 🔴 删除**：点击删除 → 确认对话框 `#confirmDialog` 弹出；确认 → 移除；取消 → 保留。
**TC-ITEM-05 🟠 分类选择**：编辑器内打开 `#categoryPicker` 选择分类 → 回填；关闭picker不丢失已填内容。
**TC-ITEM-06 🟠 到期日历**：打开 `#foodCalendar` 选日期 → 回填 `expiresOn`；可切换「相对保质期」模式。
**TC-ITEM-07 🟠 搜索/筛选**：按名称搜索、按状态筛选 → 列表实时更新；清空恢复全部。
**TC-ITEM-08 🟡 数量/单位校验**：负数/非数字数量 → 校验拦截。
**TC-ITEM-09 🟢 空状态**：无任何食材时显示空状态 + 「添加物品」引导按钮，点击可正常打开编辑器。
**TC-ITEM-10 🟢 编辑器关闭**：点关闭按钮 `#foodEditorClose`、取消、点遮罩、Esc → 均关闭且无残留。

---

## 5. 台账 Ledger / Ledger-list

**TC-LED-01 🟠 消费趋势图**：`ledger` 展示近 6 月柱状图（采购/浪费）；数据为空时显示空状态。
**TC-LED-02 🟠 KPI 卡**：节省金额、浪费金额等数值正确。
**TC-LED-03 🟠 明细列表**：`ledger-list` 展示流水表格；分页/标签切换正常。
**TC-LED-04 🟡 时间范围切换**：按月/季度切换 → 图表与表格同步更新。
**TC-LED-05 🟢 移动端**：图表高度/柱宽自适应，标签不重叠。

---

## 6. 菜谱 Recipes / Recipes-detail

**TC-REC-01 🔴 列表**：`recipes` 展示菜谱卡片（名称/标签/简介）；为空显示空状态。
**TC-REC-02 🔴 详情**：点击卡片 → `recipes-detail` 面板激活，展示食材清单与步骤。
**TC-REC-03 🟠 按食材推荐**：根据临期食材生成推荐；点击推荐项进入详情。
**TC-REC-04 🟡 新增菜谱**：「新增」→ 表单 → 保存 → 列表出现新菜谱。
**TC-REC-05 🟢 返回**：详情页返回按钮 → 回到 `recipes` 列表且滚动位置合理。

---

## 7. 预警 Alerts

**TC-ALR-01 🔴 分组展示**：`alerts` 按 已过期/24h内/72h内 分组；各组有计数。
**TC-ALR-02 🟠 处理操作**：点击「已处理」→ 条目标记删除线/移除；可撤销。
**TC-ALR-03 🟡 空状态**：无预警时显示「暂无预警」空状态。
**TC-ALR-04 🟢 跳转食材**：点击预警条目 → 跳 `items` 定位对应食材。

---

## 8. 成员 Members / Member

**TC-MEM-01 🔴 成员列表**：`account` 面板家庭管理区列出成员（头像/姓名/角色）。
**TC-MEM-02 🔴 成员详情**：点击成员 → `member` 面板激活，展示资料与权限。
**TC-MEM-03 🟠 邀请成员**：「邀请」→ 生成邀请链接/码；复制可用。
**TC-MEM-04 🟠 移除/退出**：移除成员 / 退出家庭 → 确认对话框 → 生效。
**TC-MEM-05 🟡 设备配对**：设备配对流程可发起并显示状态。
**TC-MEM-06 🟢 空状态**：无成员时（理论边界）显示合理提示。

---

## 9. 消息通知 Notifications

**TC-NOT-01 🔴 列表渲染**：`notifications` 展示通知项（图标/标题/时间/未读点）。
**TC-NOT-02 🔴 未读状态**：未读项有视觉区分；进入后未读计数清零（角标 `#notiBadge`/`#mobileNotiBadge` 同步）。
**TC-NOT-03 🟠 点击通知**：点击 → 跳转到关联视图（如对应食材/活动）。
**TC-NOT-04 🟡 标记已读/清空**：提供标记全部已读；操作后状态正确。
**TC-NOT-05 🟢 空状态**：无通知时显示空状态而非空白。

---

## 10. 设置（账户 / Agent / 偏好）

**TC-SET-01 🔴 账户表单**：`account` 当前账号信息可编辑（昵称/邮箱等）→ 保存成功提示。
**TC-SET-02 🔴 Agent 设置**：`agent-settings` 展示 Agent 配置项（名称/角色/开关）→ 保存生效。
**TC-SET-03 🔴 偏好开关**：`preferences` 中「临期到期通知」「每日晨间摘要」开关可切换；点击整行（含文字）均可切换；开关在左、文字在右（UI-space 规范）。
**TC-SET-04 🟠 预警阈值**：`preferences` 临期预警阈值数字输入 → 保存生效。
**TC-SET-05 🟠 开关状态持久化**：切换后刷新页面，开关状态保持（写入后端/本地）。
**TC-SET-06 🟢 三个设置页互不相同**：账户/ Agent / 偏好 三个面板内容各自独立，无内容重复（回归 TC-NAV-07/08/09）。

---

## 11. 物品助手 Agent（AI 对话）

**TC-AGT-01 🔴 打开对话**：导航「物品助手」/浮标 → `agent` 面板激活，展示对话区与输入框。
**TC-AGT-02 🔴 发送消息**：输入并发送 → 用户气泡出现；AI 流式/最终回复出现（无永久 loading）。
**TC-AGT-03 🟠 新对话**：「新对话」清空历史。
**TC-AGT-04 🟠 语音输入**：麦克风按钮 → 录音遮罩 `#voiceRecordingOverlay` 出现；停止 → 转写填入输入框。
**TC-AGT-05 🟡 对话列表**：侧栏对话列表切换/删除正常。
**TC-AGT-06 🟢 错误兜底**：AI 接口失败时显示友好错误并允许重试，不卡死。

---

## 12. 全屏展示 Display

**TC-DSP-01 🔴 进入展示**：`data-start-display` → `display` 面板激活，隐藏常规导航，展示大屏看板。
**TC-DSP-02 🔴 退出展示**：「退出展示」(`data-display-exit`) → 回到上一视图。
**TC-DSP-03 🟠 横/竖屏**：`orientation` 参数下布局自适应。
**TC-DSP-04 🟢 实时数据**：展示内容随后端数据更新（轮询/刷新）。

---

## 13. 弹窗与对话框（通用）

**TC-DLG-01 🔴 确认框**：`#confirmDialog` 打开时 `aria-hidden=false`；确认/取消均可关闭且回调正确。
**TC-DLG-02 🔴 食材编辑器**：见 TC-ITEM-02/03/10。
**TC-DLG-03 🟠 用户菜单**：点击 chip/头像 → `#userMenu` 显示（桌面 fixed、移动 fixed 且不被顶栏隐藏）；点击外部/选菜单项 → 关闭。
**TC-DLG-04 🟠 菜谱详情弹窗**：`#recipeModal` 打开/关闭正常（如用弹窗而非独立视图时）。
**TC-DLG-05 🟢 Esc 键**：打开任意模态时按 Esc → 关闭（或焦点正确管理）。
**TC-DLG-06 🟢 遮罩点击**：点遮罩关闭（编辑器/菜单），但不误关（如防止误触丢失表单）。

---

## 14. 空状态 / 异常 / 错误（跨视图）

**TC-ERR-01 🔴 网络失败**：模拟 API 500 → 前端显示错误提示而非白屏；可重试。
**TC-ERR-02 🔴 空数据**：逐一对 home/items/ledger/recipes/alerts/members/notifications/agent 置空 → 均显示空状态 UI。
**TC-ERR-03 🟠 加载态**：数据请求期间有 loading 指示（骨架/转圈），不闪白。
**TC-ERR-04 🟢 全局 Toast**：操作结果（保存成功/删除失败）有 `#message` Toast 提示。

---

## 15. 键盘可达性与焦点

**TC-A11Y-01 🟠 Tab 顺序**：所有可交互元素可用 Tab 到达，焦点环可见（`:focus-visible`）。
**TC-A11Y-02 🟠 开关焦点**：偏好开关聚焦时有明确轮廓（UI-space 规范 3px 品牌色）。
**TC-A11Y-03 🟡 语义标签**：表单控件有 `<label>` 关联；模态有 `aria-label`/`role`。
**TC-A11Y-04 🟢 对比度**：正文/按钮文字对比度 ≥ WCAG AA（4.5:1）。

---

## 16. 移动端适配

**TC-MOB-01 🔴 底栏导航**：移动端 `#mobileNav` 显示首页/物品/台账/菜谱/预警，点击切换正常。
**TC-MOB-02 🔴 顶栏入口**：移动首页顶栏品牌 + 铃铛 + 个人中心 chip 均点击有响应。
**TC-MOB-03 🟠 用户菜单**：移动端点击个人中心 → `#userMenu` fixed 显示（不被隐藏），可选账户/Agent/偏好/退出。
**TC-MOB-04 🟠 列表表格**：库存/台账表格在窄屏可横向滚动或卡片化，不溢出。
**TC-MOB-05 🟢 编辑器表单**：食材编辑器在移动端全屏/近全屏，输入不遮挡。

---

## 17. 后端 API 冒烟（关键端点）

| 端点 | 方法 | 用例 |
|------|------|------|
| /api/health | GET | TC-API-01 返回 200 ok |
| /api/auth/login | POST | TC-API-02 正确/错误凭证响应 |
| /api/auth/me | GET | TC-API-03 带 token 返回当前用户 |
| /api/foods | GET/POST | TC-API-04 列表/新增；缺字段返回 4xx |
| /api/foods/:id | PATCH/DELETE | TC-API-05 更新/删除；越权拦截 |
| /api/household | GET | TC-API-06 返回当前家庭 |
| /api/household/invites | POST | TC-API-07 生成邀请 |
| /api/activities | GET | TC-API-08 返回动态（可空数组） |
| /api/agent/conversations | GET/POST | TC-API-09 列表/新建会话 |
| /api/agent/messages | POST | TC-API-10 发消息返回回复或流式 |
| /api/notifications（前端映射） | GET | TC-API-11 未读计数正确 |

**TC-API-12 🔴 权限隔离**：A 家庭 token 不能读写 B 家庭数据（返回 403/404）。
**TC-API-13 🔴 未捕获异常**：对任意端点注入异常输入，服务端不 500 崩溃，返回结构化错误。
**TC-API-14 🟠 空结果**：GET 列表类端点对空数据返回 `[]` 而非 `null`，前端可安全渲染空状态。

---

## 18. 静态死链/死页自动检查清单（CI/手工）

- [ ] 所有 `data-view-target` 存在同名 `data-view-panel`
- [ ] 所有 `data-new-food` / `data-start-display` / `data-display-exit` 处理器已绑定
- [ ] 所有 `render*()` 函数对空数据有空状态分支
- [ ] 所有模态 `overlay` 有打开与关闭路径，且初始 `hidden`
- [ ] 控制台在完整走查后无 error 级日志

---

## 19. Cycle 2 增补：边界 / 异常 / 真实走查用例

> 本轮以真实 `node src/server.js`（本地 better-sqlite3 + local-demo）+ Playwright 浏览器走查验证；以下为审计发现的高价值边界用例。

**TC-ERR-05 🔴 无家庭用户（空态不白屏）**：构造无家庭成员的用户会话后，GET `/api/household` → 返回 `{household:null,members:[]}` 空态对象；`/api/activities` → `{items:[],hasMore:false}`；`/api/foods` → `{items:[]}`；写操作 → `409 {error:"membership_not_found"}`。前端对应面板展示空状态，不白屏、不抛错（对应修复 F8）。

**TC-ERR-06 🟠 启动初始化失败可重试**：首次初始化异常时 `ensureApp()` 重置缓存 promise，下一次请求可重试，避免一次失败导致所有路由（含 `/`）永久 500（对应修复 F7）。

**TC-NAV-14 🔴 物品助手「展开」入口（修复 F9）**：打开小食浮窗 → 点头部「展开」(`#quickAgentOpenFull`) → `data-view-panel="agent"` 完整视图激活并渲染对话区；此前该按钮在 DOM 中不存在导致完整 Agent 视图成为死页。

**TC-LED-06 🟠 短台账数据不崩溃**：当 `ledger` 数据点 < 2 条时 `renderLedger` 对 `prev` 取上一期做差值保护，显示「暂无上月对比数据」兜底，不报 `Cannot read properties of undefined`（对应修复 F5）。

**TC-REC-06 / TC-ALR-05 / TC-MEM-07 🟢 空列表空状态**：菜谱三网格、预警已处理 tab、家庭成员列表为空时分别渲染 `.recipe-empty` / 预警空态 / `.member-empty`，非空白面板（对应修复 F4）。

**TC-API-15 🟠 异常输入结构化返回**：对任意端点注入异常/越权输入，服务端返回结构化错误（4xx/404），不 500 崩溃、不泄露堆栈（TC-API-13 复验，走查 0 运行时错误佐证）。

**TC-NAV-15 🟢 全屏显示进入/退出**：首页「全屏显示」→ `display` 面板激活；`[data-display-exit]` → 回到上一视图（home）。走查已覆盖。

**TC-MOB-06 🟢 移动端视图可达**：390×844 下 home/items/ledger/recipes/alerts 均可激活且有内容（走查已覆盖）。

### 19.1 API 端点路径勘误（Cycle 2 实测）
- `ledger` / `recipes` / `alerts` / `notifications` **不是独立 HTTP 端点**，其数据由前端基于 `/api/foods` + `/api/activities` + `/api/agent/*` 客户端计算渲染；直接 `curl` 这些路径得到 404 属正常，不代表故障（UI 走查已确认四视图均有真实数据且 0 错误）。
- 真实关键端点：`/api/health`、`/api/auth/login|me|register|logout`、`/api/household(+/invites|/invites/inspect|/invites/accept|/leave)`、`/api/activities`、`/api/foods(+/batch)`、`/api/access-tokens`、`/api/agent/conversations|/messages|/messages/stream|/settings|/voice-settings|/transcriptions`、`/api/devices(+/pairing-codes)`、`/api/display/preview`。

---

*Cycle 1 基线 + Cycle 2 边界增补完成，均经真实浏览器走查（18/18 通过，0 运行时错误）与后端冒烟验证。进入 Cycle 3 UX 终检与产物梳理。*
