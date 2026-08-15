# 食光 FoodTime · UX/UI 边沿排查报告

> 方法：UI/UX Pro Max —— 对照交互/可达性启发式（空状态、加载态、焦点环、触控目标、Z 轴、视口单位、悬停/点按、激活态）逐视图排查。
> 严重程度：🔴阻断 / 🟠高 / 🟡中 / 🟢低

---

## A. 全局交互基线（适用全部视图）

| # | 类别 | 问题 | 规范依据 | 建议修复 | 严重 |
|---|------|------|----------|----------|------|
| U1 | 焦点环 | 自定义控件（开关、图标按钮、tab）可能缺少 `:focus-visible` 可见轮廓 | Interaction·Focus States（High） | 统一 `--focus-ring: 0 0 0 3px rgba(14,159,110,.35)`；对 `.btn/.icon-btn/.ft-switch/[data-view-target]` 加 `:focus-visible` | 🟠 |
| U2 | 触控目标 | 部分图标按钮/角标 < 44×44px（铃铛、关闭 ×、tab） | Touch·Touch Target Size（High） | 移动端图标按钮最小 44×44；关闭按钮至少 40×40 | 🟠 |
| U3 | 悬停vs点按 | 桌面 hover 效果在移动端无反馈，关键操作不应仅依赖 hover | Touch·Hover vs Tap（High） | 主操作加 `:active` 态；移动端用点击反馈 | 🟡 |
| U4 | 加载态 | 异步取数期间面板可能闪白/显示旧数据 | Animation·Loading States（High） | 统一 loading 骨架或转圈；在 `render*` 起始插入 `data-loading` | 🟠 |
| U5 | 空状态 | 多个 `render*` 在数据为 0 时未确认有空状态 UI（待前端审计确认） | 同上 | 每个列表视图提供 `.empty-state`（图标+文案+引导按钮） | 🔴 |
| U6 | Z 轴 | 浮标/菜单/遮罩 z-index 堆叠需明确刻度，避免互相遮挡 | Layout·Z-Index（High） | 定义 scale：nav 40 / overlay 80 / fab 60 / toast 90 | 🟡 |
| U7 | 视口单位 | 移动端全屏（编辑器/展示）用 `100vh` 会被浏览器工具栏裁切 | Layout·Viewport Units（Medium） | 改用 `100dvh` 或 `min-height: 100dvh` | 🟡 |
| U8 | 激活态 | 当前视图导航项高亮需稳定 | Navigation·Active State（Medium） | 确保 `setView` 统一切换 `.active` + `aria-current` | 🟢 |

---

## B. 逐视图排查

### B1 首页 Home
- **B1.1 🟠 家人动态区**：空数据时需空状态，且头像/文字已对齐（历史已修）。动态项 `activity-summary-item` 多行时 `align-items: flex-start` 已加，需确认移动端不溢出。
- **B1.2 🟡 KPI 卡**：数值为 0 时显示「0」而非空白；加载前占位。
- **B1.3 🟢 快捷入口**：「手动添加物品 / 管理全部 / 全屏显示」点击响应已确认存在。

### B2 物品 Items
- **B2.1 🔴 表格空状态**：无任何食材时必须有空状态（非空白面板）。
- **B2.2 🟠 编辑器遮罩**：`#foodEditorOverlay` 移动端需 `100dvh` 且输入框不被键盘遮挡；保存中按钮禁用防重复提交。
- **B2.3 🟡 分类/日历浮层**：`#categoryPicker` / `#foodCalendar` 定位在移动端不应溢出视口。

### B3 台账 Ledger
- **B3.1 🟠 图表空状态**：无消费数据时柱子区域显示空状态而非空白/NaN。
- **B3.2 🟡 图表 tooltip**：hover 柱体有数值提示；移动端点按有反馈。

### B4 菜谱 Recipes
- **B4.1 🔴 详情跳转**：点击卡片必须进入 `recipes-detail`；空列表有空状态。
- **B4.2 🟢 返回**：详情返回保留列表滚动位置。

### B5 预警 Alerts
- **B5.1 🟠 分组空态**：三组均空时显示统一空状态；单组空时隐藏该组而非留白。
- **B5.2 🟡 处理回执**：标记已处理后有 toast 且列表即时更新。

### B6 成员 / 账户
- **B6.1 🟠 三设置页去重**：账户/ Agent / 偏好内容已拆分为独立面板（历史已修），需回归确认无重复。
- **B6.2 🟡 邀请反馈**：生成邀请码后复制成功有提示。

### B7 消息通知 Notifications
- **B7.1 🔴 未读同步**：进入后角标 `#notiBadge` / `#mobileNotiBadge` 必须同步清零。
- **B7.2 🟠 空状态**：无通知显示空状态。

### B8 偏好设置 Preferences
- **B8.1 🟠 开关布局**：已改为「开关在左、文字在右」，整行可点（历史已修）。需确认 44px 触控与 `:focus-visible` 轮廓。
- **B8.2 🟢 禁用态**：预留 `:disabled` 浅绿（不可关项）样式，与 UI-space 一致。

### B9 物品助手 Agent
- **B9.1 🔴 流式兜底**：AI 失败时显示错误并可重试，不能永久 loading。
- **B9.2 🟠 语音遮罩**：`#voiceRecordingOverlay` 出现/消失有过渡，停止后转写填入。

### B10 全屏展示 Display
- **B10.1 🟠 退出可达**：`data-display-exit` 在任何展示页都可用；Esc 可退出。
- **B10.2 🟡 数据刷新**：展示内容随数据更新，不陈旧。

---

## C. 可达性（WCAG AA）

| # | 项 | 建议 | 严重 |
|---|----|------|------|
| C1 | 对比度 | 正文 `#12211B` on `#F7F4EC` 达标；次要文字 `#5C6D64` 需复核 ≥4.5:1 | 🟡 |
| C2 | 语义 | 表单控件 `<label for>` 关联；模态 `role="dialog" aria-modal` | 🟠 |
| C3 | 标题层级 | 每视图单一 `h1`，次级 `h2/h3` 不跳级 | 🟢 |
| C4 | 减少动效 | 全局加 `@media (prefers-reduced-motion: reduce)` 降级 | 🟡 |

---

## D. 修复优先级（Cycle 1 立即执行）

1. 🔴 全部列表视图空状态（B2.1/B4.1/B5.1/B7.2 等）
2. 🔴 通知未读同步（B7.1）
3. 🔴 AI 失败兜底（B9.1）
4. 🟠 统一 focus-visible（U1）
5. 🟠 移动端触控目标 ≥44px（U2）
6. 🟠 加载态骨架（U4）
7. 🟠 Z 轴刻度 + 视口 dvh（U6/U7）

> 注：🔴空状态与死页问题以**前端审计**结果为准，审计返回后合并到 `FIXES` 清单并执行。
