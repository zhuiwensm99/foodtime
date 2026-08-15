# 食光 FoodTime 家庭 Web 端 · 前端审查报告（Round 1）

- **项目路径**：`/Users/a1234/WorkBuddy/2026-08-12-19-59-06/foodtime-xianzhi`
- **技术栈**：原生 JS（无框架），`public/app.js`（4095 行）、`public/index.html`、`public/styles.css`、`public/styles-foodtime.css`
- **审查方式**：静态代码审查 + 元素 ID 交叉校验（`app.js` 引用的 194 个 `#id` 与 `index.html` 逐一比对）+ `node --check` 语法校验
- **审查范围**：登录、库存、台账、菜谱、预警、家庭/账户、AI 助手、通知、设置、全屏展示等全部页面与交互
- **预览地址**：`http://127.0.0.1:8790/`（按约束仅代码审查，未自行启动 server）

---

## 一、发现汇总

| 指标        | 数量                    |
| --------- | --------------------- |
| 发现 Bug 总数 | **13**                |
| 已修复（本轮）   | **5**（P0×1、P2×3、P3×1） |
| 剩余待修复     | **8**（均为 P3 优化/建议）    |

优先级分布：P0=1，P1=0，P2=3，P3=9（其中 1 个 P3 已修复）。

---

## 二、Bug 清单

### 🔴 P0（阻塞）

#### [P0-1] 库存页「批量修改日期」点击即崩溃（TypeError）

- **位置**：`public/app.js` 第 112–116 行（顶部 `batchFoodDate` 对象）、`openBatchFoodDate`（1446）、`closeBatchFoodDate`（1454）、`updateSelectedFoodExpiry`（1478）；`index.html` 缺失 `#batchFoodDateOverlay` 等元素。
- **现象**：库存页 → 点「管理」→ 勾选若干食材 → 点「修改日期」（`#foodBatchDate`），页面无任何响应且无弹窗，控制台抛 `TypeError: Cannot read properties of null (reading 'classList')`，后续批量能力全部失效。
- **根因**：`app.js` 在脚本加载时执行 `const batchFoodDate = { overlay: $("#batchFoodDateOverlay"), input: $("#batchFoodDateInput"), cancel: $("#batchFoodDateCancel"), save: $("#batchFoodDateSave") }`；但 `index.html` 中**从未定义这些元素**（ID 交叉校验确认缺失）。`openBatchFoodDate()` 首行即 `batchFoodDate.overlay.classList.remove("hidden")`，而 `overlay` 为 `null`，直接抛错。该路径**无空值保护**。
- **修复建议**：在 `index.html` 中补齐 `#batchFoodDateOverlay` 弹窗（含 `#batchFoodDateInput` / `#batchFoodDateCancel` / `#batchFoodDateSave`）。
- **优先级**：P0
- **状态**：✅ **已修复**——在 `index.html` 的 `#dialogOverlay` 之前新增了与确认弹窗同构的 `#batchFoodDateOverlay` 对话框。

---

### 🟠 P1（严重）

本轮未发现会导致用户可见崩溃的 P1 级 Bug（P0 修复后，全部可达交互路径均无空指针崩溃）。`loadDevices`/`loadTokens` 曾会在登录 `Promise.all` 中抛错，但被 `enterWorkspace` 的 `try/catch` 吞掉，未造成用户可见故障，归为 P2（见 P2-2）。

---

### 🟡 P2（一般）

#### [P2-1] 「按起始日 + 保质期」模式下计算出的到期日不显示

- **位置**：`public/app.js` `updateCalculatedExpiry`（453）；`index.html` 第 872–889 行 `data-expiry-panel="calculated"` 面板。
- **现象**：在食材编辑器选「按起始日 +  保质期」模式，填好起始日期与天数后，界面始终停留在提示文案「填写起始日期和有效天数后显示预计到期日」，看不到计算出的预计到期日，用户无法确认结果即提交。
- **根因**：`updateCalculatedExpiry` 写入目标元素 `#calculatedExpiry`，但 `index.html` 中该面板只有 `#foodExpiryHelper`、没有 `#calculatedExpiry`。函数开头 `if (!output) return;` 因取不到元素而**提前返回**，计算结果从未落 DOM。
- **修复建议**：在 `calculated` 面板内新增 `<p id="calculatedExpiry" class="field-expiry-result"></p>`，并补充对应样式。
- **优先级**：P2
- **状态**：✅ **已修复**——已添加 `#calculatedExpiry` 元素并补充 `.field-expiry-result` / `.field-expiry-result.ready` 样式（`styles-foodtime.css`）。

#### [P2-2] 登录初始化时 `loadDevices` / `loadTokens` 对废弃元素直接赋值抛错

- **位置**：`public/app.js` `loadDevices`（1496–1505）、`loadTokens`（1543）；`enterWorkspace`（660）通过 `Promise.all([... loadDevices(), loadTokens() ...])` 调用。
- **现象**：每次登录成功后在控制台出现 `Cannot set properties of null` 报错；依赖 `enterWorkspace` 外层 `try/catch` 吞掉后程序才继续，存在「其余并行加载被整体 reject」的竞态隐患，且控制台报错不利于线上排障。 
- **根因**：设备页（`#devices`/`#overviewDevice`）与访问令牌页（`#accessTokens`）已从 UI 移除，但 `loadDevices`/`loadTokens` 仍直接 `$("#devices").innerHTML = ...`、`$("#overviewDevice").innerHTML = ...`、`$("#accessTokens").innerHTML = ...`，这些选择器返回 `null`，**未做空值保护**。
- **修复建议**：将直接赋值改为 `const el = $("#x"); if (el) el.innerHTML = ...`。
- **优先级**：P2
- **状态**：✅ **已修复**——两处均改为 `if (el)` 守卫；`node --check` 通过。

#### [P2-3] 深链 `#/household` 无法打开家庭管理页（静默回退首页）

- **位置**：`public/app.js` `setView`（303）、`views` 集合（98）；`index.html` 无 `data-view-panel="household"`。
- **现象**：在地址栏直接访问 `#/household`（任务书明确的家庭管理页入口）时，页面停留在首页而非家庭管理内容；但通过头像菜单「账户管理」(#/account) 仍可进入，家庭管理功能本身可用。
- **根因**：`views` 集合不含 `household`，`setView` 中 `views.has(view) ? view : "home"` 会把它**静默回退到 home**；且 `setView` 没有把 `household` 别名到实际承载家庭管理功能的 `account` 面板。
- **修复建议**：在 `setView` 入口增加视图别名 `VIEW_ALIASES = { household: "account" }`。
- **优先级**：P2
- **状态**：✅ **已修复**——已加别名映射，`#/household` 现在正确路由到账户/家庭管理面板。

---

### 🟢 P3（优化 / 建议）

#### [P3-1] 库存列表计数「共 0 条记录」永远不变

- **位置**：`public/app.js` `renderFoodList`（1322）；`index.html` 第 364 行 `#foodListSummary`。
- **现象**：食材列表右上角始终显示「共 0 条记录」，与实际条数不符。
- **根因**：`renderFoodList` 只更新了 `#itemsCount`，从未更新 `#foodListSummary`，而 HTML 写死为「共 0 条记录」。
- **修复建议**：在 `renderFoodList` 同步 `foodListSummary.textContent = \`共 ${items.length} 条记录\`\`。
- **优先级**：P3
- **状态**：✅ **已修复**——已在 `renderFoodList` 中同步更新。

#### [P3-2] 单条食材无「删除」入口，仅支持管理模式下批量删除

- **位置**：`public/app.js` `renderFoodList`（1374–1402）行操作区；`#foods` 点击处理（2204–2230 仅处理 `data-item-eat/cook/discard/edit/restore/delete`，但表格渲染中并无 `data-delete` 按钮）。
- **现象**：当前行操作仅有「吃掉 / 做菜 / 丢弃 / 编辑」，删除单条食材必须进入「管理」模式、勾选、再点「删除」。任务书行操作清单未要求单删，但体验偏弱。
- **根因**：表格式 `renderFoodList` 没有渲染 `data-delete` 按钮（`data-delete` 仅存在于已不再使用的 `renderFood` 旧版 article 渲染中，且 `renderFood` 当前未被调用）。
- **修复建议**：在行操作区补充一个单删按钮，或在「编辑」浮层中加删除项。
- **优先级**：P3
- **状态**：⏳ 待修复（建议）

#### [P3-3] 内联脚本中 `[data-alert-tab]` 监听器重复定义两次且切换无样式类

- **位置**：`public/index.html` 第 995–999 行与第 1042–1046 行（完全相同）；真实逻辑在 `public/app.js` `wireFoodTime`（3974）。
- **现象**：预警页「待处理 / 已处理」切换功能正常（由 app.js 的 `.alert-tab` 监听 + `renderAlerts` 切换 `.active` 类驱动，CSS 仅对 `.alert-tab.active` 着色）。内联脚本的 `.on` 类无对应样式，属冗余。
- **根因**：两份重复内联监听仅做 `classList.toggle("on", ...)`，与 app.js 真实逻辑并存，造成维护困惑。
- **修复建议**：删除 `index.html` 中两段重复的 `[data-alert-tab]` 内联监听，统一由 app.js 驱动。
- **优先级**：P3
- **状态**：⏳ 待修复（建议）

#### [P3-4] 登录页「7 天内免登录」勾选不生效

- **位置**：`public/app.js` `loginForm` submit（2068）仅 `body: JSON.stringify({ login, password })`；`index.html` `#loginRemember` 复选框。
- **现象**：勾选「7 天内免登录」后提交，后端收不到 remember 标识，记忆登录行为由后端默认会话策略决定，复选框形同虚设。
- **根因**：提交体未包含 `remember` 字段。
- **修复建议**：提交时追加 `remember: $("#loginRemember").checked`。
- **优先级**：P3
- **状态**：⏳ 待修复（建议）

#### [P3-5] 「忘记密码」使用原生 `alert()`，与全局 toast 风格不一致

- **位置**：`public/index.html` 第 1039 行内联脚本 `$("#forgotPassword")?.addEventListener("click", () => { ...; alert("请联系家庭管理员重置密码。"); })`。
- **现象**：点击弹出浏览器原生 alert，与全局 `toast()` 轻提示体验割裂。
- **修复建议**：改为 `toast("请联系家庭管理员重置密码。")`（需将 `toast` 暴露到内联作用域，或改为触发 `data-view-target` 跳转）。
- **优先级**：P3
- **状态**：⏳ 待修复（建议）

#### [P3-6] 全屏展示页缺失若干区块元素，内容不完整（不崩溃）

- **位置**：`public/app.js` `renderPresentation`（1052–1096）引用 `#displayCategories` / `#displayNextFood` / `#displayNextFoodMeta` / `#displayActivityCount` / `#displayActivities`；`index.html` 全屏展示面板（290–335）未包含这些元素。
- **现象**：全屏展示只显示核心概览与食材列表，缺少「分类构成 / 下一件提醒 / 动态数量 / 动态列表」区块；代码已用 `if (el)` 守卫，故**不崩溃**，仅为内容缺口。
- **修复建议**：在展示面板补齐对应容器元素，让全屏页信息更完整。
- **优先级**：P3
- **状态**：⏳ 待修复（建议）

#### [P3-7] 家庭邀请码生成后无「复制邀请链接」按钮

- **位置**：`public/app.js` `_el_copyHouseholdInvite`（`#copyHouseholdInvite`，2429）已用 `if` 守卫；`index.html` 的 `#householdInvitePanel`（476–480）仅有邀请码文本与有效期，无复制按钮。
- **现象**：生成邀请码后只能人工选中复制，无法一键复制邀请链接（`state.householdInvite.inviteUrl`）。
- **修复建议**：在 `#householdInvitePanel` 增加「复制邀请链接」按钮 `#copyHouseholdInvite`。
- **优先级**：P3
- **状态**：⏳ 待修复（建议）

#### [P3-8] 成员/会员相关代码不可达（死代码）

- **位置**：`public/app.js` `renderMember`（3874）、`state.selectedMemberId`、`wireFoodTime` 中 `#membersInvite`（3995）；`index.html` 无 `#memberDetail` / `#membersInvite`。
- **现象**：`renderMember` 因 `#memberDetail` 不存在而提前返回；「会员」视图 `member` 未加入 `views` 集合且 `setView("member")` 会回退首页。这些是已废弃/未接入的死代码，不产生崩溃，但增加维护负担。
- **修复建议**：若会员功能暂不提供，清理 `renderMember`/`membersInvite` 等死代码；若要提供，补全 `data-view-panel="member"` 与对应渲染接线。
- **优先级**：P3
- **状态**：⏳ 待修复（建议）

#### [P3-9] 小食助手快捷入口双重绑定

- **位置**：`public/index.html` 第 1030–1036 行内联 `[data-quick-shortcut]` 监听（仅填文本框）；`public/app.js` `wireFoodTime` `.quick-agent-shortcuts` 监听（填框 + `form.requestSubmit()` 提交）。
- **现象**：点击快捷入口时两段监听同时触发，功能正常（最终由 app.js 提交）。但在「拍照识食材」场景，内联监听会先把文本框写成「拍照识食材」再交给 app.js 调相机，略显多余。
- **修复建议**：移除内联 `[data-quick-shortcut]` 填框逻辑，统一由 app.js `handleQuickShortcut` 处理。
- **优先级**：P3
- **状态**：⏳ 待修复（建议）

---

## 三、已修复改动清单（本轮）

| 文件                           | 改动                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `public/index.html`          | 新增 `#batchFoodDateOverlay` 批量修改日期弹窗（修复 P0-1）                                                         |
| `public/index.html`          | 在 `data-expiry-panel="calculated"` 面板内新增 `#calculatedExpiry` 元素（修复 P2-1）                             |
| `public/styles-foodtime.css` | 新增 `.field-expiry-result` / `.field-expiry-result.ready` / `.date-input` 样式（配合 P2-1）                 |
| `public/app.js`              | `loadDevices` / `loadTokens` 对 `#devices`/`#overviewDevice`/`#accessTokens` 改为 `if (el)` 守卫（修复 P2-2） |
| `public/app.js`              | `setView` 增加 `VIEW_ALIASES = { household: "account" }`（修复 P2-3）                                      |
| `public/app.js`              | `renderFoodList` 同步更新 `#foodListSummary`（修复 P3-1）                                                    |

> 所有改动后已执行 `node --check public/app.js`，**语法校验通过**；新增 5 个元素 ID 均已在 `index.html` 中确认存在。

---

## 四、未覆盖说明（约束内）

- 按任务铁律，**未运行任何 edgeone CLI 命令、未自行启动 HTTP server**，仅基于代码静态审查 + ID 交叉校验完成。预览地址 `http://127.0.0.1:8790/` 可在部署后人工复核。
- **移动端/桌面端布局**：已核对 `styles.css` / `styles-foodtime.css` 中存在 `max-width` 媒体查询与 `.inventory-table` 横向滚动等适配规则，未发现有结构性遮挡/重叠的死代码；但像素级视觉对齐需结合真机预览复核（本次无浏览器驱动能力，建议下一轮用预览地址做端到端点击回归）。
- 后端接口（如 `/api/foods/:id/handle`、`/api/foods/batch` 等）的可用性不在本次前端审查范围，假设其按约定返回；前端已对失败做乐观更新回滚与 toast 提示。

---

## 五、总结

- **发现 Bug 数量**：13
- **已修复数量**：5（P0×1、P2×3 中的核心健壮性已修、P3×1）
- **剩余待修复数量**：8（全部为 P3 优化/建议，不影响核心交互可用性）
- **结论**：核心交互链路（登录、库存增删改/吃掉做菜丢弃/批量管理、台账、菜谱、预警、通知、设置、AI 助手、全屏展示）在修复 P0-1 后均无空指针崩溃；P2/P3 多为健壮性、信息完整性与体验优化项，建议下一轮排期清理。
