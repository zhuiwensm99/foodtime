"use strict";

const $ = (selector) => document.querySelector(selector);
const { renderMarkdown } = window.XianZhiMarkdown;
const voiceControllers = new WeakMap();
let activeVoiceController = null;
let voiceRecordingOverlayOwner = null;

function scrubSensitiveAuthQuery() {
  const url = new URL(window.location.href);
  const hadSensitiveAuthQuery = url.searchParams.has("login") || url.searchParams.has("password");
  if (!hadSensitiveAuthQuery) return;
  url.searchParams.delete("login");
  url.searchParams.delete("password");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

scrubSensitiveAuthQuery();
const state = { user: null, household: null, householdInvite: null, pendingInviteCode: new URL(window.location.href).searchParams.get("invite") || "", foods: [], activities: [], activitiesHasMore: false, devices: [], users: [], tokens: [], conversations: [], aiSettings: null, systemAiSettings: null, activeConversationId: null, agentConfigured: false, agentMode: "unconfigured", agentQuota: null, voiceConfigured: null, canManageUsers: false, today: "", editingId: null, view: "overview", foodList: { filter: "all", location: "", query: "", sort: "urgency", managing: false, expandedId: null, selectedIds: new Set() } };
const QUICK_CONVERSATION_REUSE_MS = 60 * 60 * 1000;
const MAX_VOICE_RECORDING_MS = 60 * 1000;
const VOICE_LONG_PRESS_MS = 280;
const VOICE_CANCEL_DISTANCE_PX = 72;
const DISPLAY_REFRESH_MS = 30 * 1000;

// 食光家庭版：前端演示数据（后端暂无消费/菜谱/成员等接口）
const demo = {
  ledger: [
    { m: "3 月", buy: 1980, waste: 210 }, { m: "4 月", buy: 1840, waste: 176 },
    { m: "5 月", buy: 1760, waste: 142 }, { m: "6 月", buy: 1712, waste: 118 },
    { m: "7 月", buy: 1689, waste: 92 }, { m: "8 月", buy: 1486, waste: 68 }
  ],
  ledgerTxns: {
    purchase: [
      { d: "08-12", n: "牛腩", q: "800 g", amount: 68.0 }, { d: "08-11", n: "土鸡蛋", q: "12 个", amount: 15.8 },
      { d: "08-10", n: "菠菜", q: "400 g", amount: 4.8 }, { d: "08-09", n: "纯牛奶", q: "2 盒", amount: 12.9 },
      { d: "08-08", n: "三文鱼", q: "320 g", amount: 45.0 }, { d: "08-07", n: "西兰花", q: "2 个", amount: 9.9 },
      { d: "08-06", n: "五花肉", q: "600 g", amount: 32.0 }, { d: "08-05", n: "蔬果周配", q: "1 份", amount: 268.0 },
      { d: "08-02", n: "牛奶月订", q: "1 期", amount: 156.0 }, { d: "08-01", n: "粮油礼包", q: "1 箱", amount: 299.0 }
    ],
    waste: [
      { d: "08-11", n: "芹菜", q: "300 g", amount: 2.1, reason: "过期未处理" },
      { d: "08-10", n: "老豆腐", q: "1 盒", amount: 6.0, reason: "过期变质" },
      { d: "08-09", n: "纯牛奶", q: "1 盒", amount: 6.45, reason: "忘记喝" },
      { d: "08-05", n: "生菜", q: "200 g", amount: 3.2, reason: "放蔫了" },
      { d: "08-02", n: "香蕉", q: "4 根", amount: 8.2, reason: "过熟" },
      { d: "07-28", n: "鸡胸肉", q: "250 g", amount: 21.0, reason: "过期" }
    ],
    savings: [
      { m: "3 月", amount: 320 }, { m: "4 月", amount: 280 }, { m: "5 月", amount: 310 },
      { m: "6 月", amount: 350 }, { m: "7 月", amount: 382 }, { m: "8 月", amount: 300 }
    ]
  },
  recipesBase: [
    { t: "番茄土豆牛腩煲", m: "约 55 分钟 · 4 人份", g: "linear-gradient(150deg,#E8825F,#C74E33)", tag: "用掉 3 样临期", c: ["牛腩", "番茄", "土豆"], ing: ["牛腩 600g", "番茄 4 个", "土豆 2 个", "洋葱 1 个", "姜 4 片"], step: "牛腩冷水下锅焯水去浮沫；番茄去皮切块炒出沙；下牛腩与洋葱翻炒；加开水没过食材，小火炖 40 分钟；下土豆块再炖 15 分钟，调味收汁。" },
    { t: "蒜香菠菜鸡蛋饼", m: "约 18 分钟 · 2 人份", g: "linear-gradient(150deg,#3FA97C,#146B4C)", tag: "用掉 2 样临期", c: ["菠菜", "土鸡蛋"], ing: ["菠菜 1 把", "土鸡蛋 3 个", "面粉 50g", "盐 3g"], step: "菠菜焯水挤干切碎，与鸡蛋、面粉、盐调成糊；平底锅少油，倒入面糊摊平，中小火两面煎至金黄。" },
    { t: "香煎三文鱼配时蔬", m: "约 25 分钟 · 2 人份", g: "linear-gradient(150deg,#5E8BD6,#2F5FA8)", tag: "高蛋白", c: ["三文鱼", "西兰花"], ing: ["三文鱼 300g", "西兰花 1 个", "柠檬 1/4 个", "黑胡椒少许"], step: "三文鱼用盐、黑胡椒、柠檬汁腌 10 分钟；平底锅少油，中火每面煎 4 分钟；西兰花焯水装盘。" },
    { t: "牛奶炖蛋", m: "约 20 分钟 · 3 人份", g: "linear-gradient(150deg,#E7B45C,#C08A2C)", tag: "今天到期", c: ["纯牛奶", "土鸡蛋"], ing: ["纯牛奶 250ml", "土鸡蛋 2 个", "白糖 20g"], step: "鸡蛋打散加入白糖搅匀，倒入温牛奶过筛；盖保鲜膜，水开后中火蒸 12 分钟，关火焖 3 分钟。" },
    { t: "香菇滑鸡砂锅饭", m: "约 40 分钟 · 4 人份", g: "linear-gradient(150deg,#8C7A5E,#5E5040)", tag: "一锅出", c: ["香菇", "大米"], ing: ["鸡腿肉 300g", "香菇 6 朵", "大米 2 杯", "生抽 2 勺"], step: "鸡腿切块用生抽腌 10 分钟；香菇切片爆香；与大米、生抽、少许油拌匀，加等量水入砂锅焖 25 分钟。" },
    { t: "清炒西兰花", m: "约 10 分钟 · 2 人份", g: "linear-gradient(150deg,#4FB187,#1E7A57)", tag: "低卡", c: ["西兰花", "蒜"], ing: ["西兰花 1 个", "蒜 3 瓣", "盐 2g"], step: "西兰花切小朵焯水 1 分钟过凉；热油爆香蒜片，下西兰花快速翻炒，调盐出锅。" }
  ],
  aiRecipes: [
    { t: "菠菜牛腩暖汤", m: "约 45 分钟 · 4 人份", g: "linear-gradient(150deg,#C9563E,#8E3322)", tag: "小食生成 · 清 3 样临期", c: ["牛腩", "菠菜", "番茄"], ing: ["牛腩 500g", "菠菜 1 把", "番茄 2 个", "姜 3 片"], step: "牛腩焯水后与姜片炒香，加开水炖 30 分钟；下番茄块炖 10 分钟；最后下菠菜烫 1 分钟，调盐胡椒出锅。" },
    { t: "牛奶蒸蛋羹", m: "约 15 分钟 · 2 人份", g: "linear-gradient(150deg,#E7C173,#C29435)", tag: "小食生成 · 今日到期优先", c: ["纯牛奶", "土鸡蛋"], ing: ["纯牛奶 150ml", "土鸡蛋 1 个", "白糖 10g"], step: "鸡蛋打散与温牛奶、糖搅匀过筛，盖保鲜膜，水开后小火蒸 10 分钟。" },
    { t: "香菇豆腐煲", m: "约 22 分钟 · 3 人份", g: "linear-gradient(150deg,#7C8A5E,#4E5A36)", tag: "小食生成 · 素食", c: ["香菇", "嫩豆腐"], ing: ["香菇 8 朵", "嫩豆腐 1 盒", "葱 2 根", "生抽 1 勺"], step: "香菇切片爆香，加开水炖 5 分钟；下切块嫩豆腐再炖 8 分钟，淋生抽撒葱花。" }
  ],
  weeklyMenu: [
    { d: "周一", t: "晚餐", n: "番茄土豆牛腩煲", tag: "清临期", g: "linear-gradient(150deg,#E8825F,#C74E33)", c: ["牛腩", "番茄", "土豆"] },
    { d: "周二", t: "早餐", n: "蒜香菠菜鸡蛋饼", tag: "清临期", g: "linear-gradient(150deg,#3FA97C,#146B4C)", c: ["菠菜", "土鸡蛋"] },
    { d: "周三", t: "晚餐", n: "香煎三文鱼配时蔬", tag: "高蛋白", g: "linear-gradient(150deg,#5E8BD6,#2F5FA8)", c: ["三文鱼", "西兰花"] },
    { d: "周四", t: "早餐", n: "牛奶炖蛋", tag: "今日到期优先", g: "linear-gradient(150deg,#E7B45C,#C08A2C)", c: ["纯牛奶", "土鸡蛋"] }
  ],
  todayMenu: [
    { t: "早餐", n: "牛奶炖蛋", g: "linear-gradient(150deg,#E7B45C,#C08A2C)", tag: "今日到期优先", c: ["纯牛奶", "土鸡蛋"] },
    { t: "午餐", n: "蒜香菠菜鸡蛋饼", g: "linear-gradient(150deg,#4FB187,#1E7A57)", tag: "低卡", c: ["菠菜", "土鸡蛋"] },
    { t: "晚餐", n: "番茄土豆牛腩煲", g: "linear-gradient(150deg,#E8825F,#C74E33)", tag: "清临期", c: ["牛腩", "番茄", "土豆"] }
  ],
  members: [
    { n: "林见夏", a: "林", r: "户主", g: "linear-gradient(150deg,#0E9F6E,#0C6C4C)", p: ["全部权限", "设备管理", "成员管理"] },
    { n: "周砚清", a: "周", r: "家庭成员", g: "linear-gradient(150deg,#E08A00,#B36E00)", p: ["录入食材", "核销食材"] },
    { n: "许知微", a: "许", r: "家庭成员", g: "linear-gradient(150deg,#2F6FED,#1E4CB0)", p: ["录入食材", "核销食材"] },
    { n: "林奶奶", a: "奶", r: "家庭成员（简化视图）", g: "linear-gradient(150deg,#7357E6,#4B34B0)", p: ["查看库存", "核销食材"] }
  ],
  notifications: [
    { icon: "!", title: "芹菜已过期，建议尽快处理", time: "10 分钟前", unread: true },
    { icon: "⏰", title: "纯牛奶将在 1 天内到期", time: "1 小时前", unread: true },
    { icon: "✓", title: "本周浪费较上月减少 27%", time: "今天 09:12", unread: false },
    { icon: "＋", title: "周砚清 添加了 3 件物品", time: "昨天 20:40", unread: false }
  ]
};
// 前端标记态：已处理的物品（吃掉/做菜/丢弃）与已处理的预警
state.alertHandled = new Set();
state.notifRead = new Set(); // 已读通知 key（alert-{foodId} / act-{activityId}）
state.alertTab = "pending";
state.ledgerTab = "purchase";
state.pref = { warnDays: 3, notifyExpire: true, notifyDevice: true, daily: true };
state.selectedMemberId = null;
const views = new Set(["home", "items", "ledger", "ledger-list", "recipes", "recipes-detail", "alerts", "notifications", "account", "agent-settings", "preferences", "display", "agent"]);
const loginPanel = $("#loginPanel");
const workspace = $("#workspace");
const message = $("#message");
const foodForm = $("#foodForm");
const foodEditor = {
  overlay: $("#foodEditorOverlay"),
  panel: $(".food-editor"),
  title: $("#foodEditorTitle"),
  hint: $("#foodEditorHint"),
  close: $("#foodEditorClose"),
  cancel: $("#foodEditorCancel"),
  save: $("#foodEditorSave") || document.querySelector(".food-editor button[type='submit']")
};
const batchFoodDate = {
  overlay: $("#batchFoodDateOverlay"),
  input: $("#batchFoodDateInput"),
  cancel: $("#batchFoodDateCancel"),
  save: $("#batchFoodDateSave")
};
const CATEGORY_OPTIONS = [
  ["水果", "🍓"], ["蔬菜", "🥬"], ["肉类", "🥩"], ["海鲜", "🐟"],
  ["乳品", "🥛"], ["蛋类", "🥚"], ["饮料", "🥤"], ["豆制品", "🫘"],
  ["熟食", "🍱"], ["调味品", "🧂"], ["冷冻", "❄️"], ["甜点", "🍰"],
  ["零食", "🍪"], ["药品", "💊"], ["保健品", "🧴"], ["美妆个护", "🧴"],
  ["日用品", "🧻"], ["宠物用品", "🐾"], ["其他", "📦"]
];
const loginForm = $("#loginForm");
const registerForm = $("#registerForm");
const screenFrame = $("#screenFrame");
const screenPreview = $("#screenPreview");
const voiceRecordingOverlay = $("#voiceRecordingOverlay");
const voiceRecordingTitle = $("#voiceRecordingTitle");
const voiceRecordingHint = $("#voiceRecordingHint");
const voiceRecordingWave = $("#voiceRecordingWave");
const dialog = {
  overlay: $("#dialogOverlay"),
  eyebrow: $("#dialogEyebrow"),
  title: $("#dialogTitle"),
  body: $("#dialogBody"),
  cancel: $("#dialogCancel"),
  confirm: $("#dialogConfirm")
};
let closeActiveDialog = null;
let foodEditorPreviousFocus = null;
let foodEditorBaseline = "";
let expiryMode = "direct";
let activeCalendarTarget = null;
let calendarCursor = new Date();
let displayClockTimer = null;
let displayRefreshTimer = null;
let displayWakeLock = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const body = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(body?.error || `请求失败 (${response.status})`);
    error.code = body?.code || "";
    error.status = response.status;
    throw error;
  }
  return body;
}

async function apiStream(path, options = {}, onEvent = () => {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const body = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
    const error = new Error(body?.error || `请求失败 (${response.status})`);
    error.code = body?.code || "";
    error.status = response.status;
    throw error;
  }
  if (!response.body) throw new Error("当前浏览器不支持流式响应");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handleEvent = (event) => {
    if (event.type === "error") {
      const error = new Error(event.error || "Agent 请求失败");
      error.code = event.code || "";
      error.status = event.status || 500;
      throw error;
    }
    onEvent(event);
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      handleEvent(JSON.parse(line));
    }
    if (done) break;
  }
  if (buffer.trim()) handleEvent(JSON.parse(buffer));
}

function toast(text) {
  if (!message) return;
  message.textContent = text;
  message.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => message.classList.remove("show"), 2500);
}

function mcpUrl() {
  return new URL("/mcp", window.location.origin).href;
}

function agentSetupPrompt(token) {
  return `请帮我安装“鲜知贴”MCP：名称设为 xianzhitie，服务地址是 ${mcpUrl()}，Bearer Token 是 ${token}。请按当前 Agent 客户端支持的方式完成配置，将令牌作为 XIANZHITIE_MCP_TOKEN 环境变量安全保存，不要把令牌写进项目文件、提交到 Git 或在回复中重复展示；配置后验证 MCP 是否能连接，并告诉我是否需要重启客户端。`;
}

function setAuthMode(mode) {
  const register = mode === "register";
  loginForm.classList.toggle("hidden", register);
  registerForm.classList.toggle("hidden", !register);
  const hasPendingInvite = Boolean(state.pendingInviteCode);
  if (register && hasPendingInvite) {
    $("#authTitle").textContent = "加入家庭";
    $("#authHint").textContent = "填写信息注册后，即可加入邀请人的家庭。已有账户请返回登录，登录后会自动提示加入。";
  } else {
    $("#authTitle").textContent = register ? "注册食光" : "欢迎回来";
    $("#authHint").textContent = register ? "用邮箱创建一个本地家庭账号" : "登录家庭账户，继续管理家庭的食材台账。";
  }
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
}

function confirmDialog({
  eyebrow = "需要确认",
  title = "确认操作",
  body = "",
  cancelText = "取消",
  confirmText = "确定",
  tone = "default"
}) {
  return new Promise((resolve) => {
    closeActiveDialog?.(false);
    const previousFocus = document.activeElement;

    if (!dialog.overlay || !dialog.eyebrow || !dialog.title || !dialog.body || !dialog.cancel || !dialog.confirm) {
      const message = body ? `${title}\n\n${body}` : title;
      resolve(window.confirm(message));
      return;
    }

    const close = (confirmed) => {
      dialog.overlay.classList.add("hidden");
      dialog.overlay.setAttribute("aria-hidden", "true");
      dialog.cancel.removeEventListener("click", handleCancel);
      dialog.confirm.removeEventListener("click", handleConfirm);
      dialog.overlay.removeEventListener("click", handleOverlayClick);
      document.removeEventListener("keydown", handleKeyDown);
      closeActiveDialog = null;
      previousFocus?.focus?.({ preventScroll: true });
      resolve(confirmed);
    };

    const handleCancel = () => close(false);
    const handleConfirm = () => close(true);
    const handleOverlayClick = (event) => {
      if (event.target === dialog.overlay) close(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        close(false);
        return;
      }
      if (event.key === "Tab") {
        const focusable = [dialog.cancel, dialog.confirm];
        const currentIndex = focusable.indexOf(document.activeElement);
        const offset = event.shiftKey ? -1 : 1;
        const nextIndex = currentIndex === -1
          ? 0
          : (currentIndex + offset + focusable.length) % focusable.length;
        event.preventDefault();
        focusable[nextIndex].focus({ preventScroll: true });
      }
    };

    closeActiveDialog = close;
    dialog.eyebrow.textContent = eyebrow;
    dialog.title.textContent = title;
    dialog.body.textContent = body;
    dialog.cancel.textContent = cancelText;
    dialog.confirm.textContent = confirmText;
    dialog.confirm.classList.toggle("danger", tone === "danger");
    dialog.overlay.classList.remove("hidden");
    dialog.overlay.setAttribute("aria-hidden", "false");
    dialog.cancel.addEventListener("click", handleCancel);
    dialog.confirm.addEventListener("click", handleConfirm);
    dialog.overlay.addEventListener("click", handleOverlayClick);
    document.addEventListener("keydown", handleKeyDown);
    dialog.cancel.focus({ preventScroll: true });
  });
}

function setView(view, options = {}) {
  const VIEW_ALIASES = { household: "account" };
  view = String(view || "").replace(/^\//, "");
  view = VIEW_ALIASES[view] || view;
  let target = views.has(view) ? view : "home";
  // 若目标无任何对应面板（废弃视图或非法深链），回退首页，避免整页空白
  if (!document.querySelector(`[data-view-panel="${target}"]`)) target = "home";
  const previousView = state.view;
  state.view = target;
  document.body.classList.toggle("agent-view-active", target === "agent");
  document.body.classList.toggle("presentation-view-active", target === "display");
  updateBreadcrumb(target);
  $("#quickAgentForm").classList.toggle("hidden", !state.user || target === "agent");
  if (target === "agent") {
    closeQuickAgent();
    voiceControllers.get($("#quickAgentForm"))?.abort();
  }
  // 在 home/items 之外的视图隐藏 AI 助手浮窗，避免遮挡内容
  const aiFab = $("#quickAgentFab");
  if (target !== "home" && target !== "items") {
    closeQuickAgent();
    if (aiFab) aiFab.classList.add("hidden");
  } else if (aiFab) {
    aiFab.classList.remove("hidden");
  }
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === target);
  });
  const NAV_BY_VIEW = { home: "home", activities: "home", items: "items", ledger: "ledger", "ledger-list": "ledger", recipes: "recipes", alerts: "alerts" };
  document.querySelectorAll("#mainNav [data-view-target], #mobileNav [data-view-target]").forEach((button) => {
    const active = button.dataset.viewTarget === NAV_BY_VIEW[target];
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (options.updateHash !== false) history.replaceState(null, "", `${location.pathname}${location.search}#${target}`);
  if (target === "devices") refreshPreview();
  if (target === "display") startPresentation();
  else if (previousView === "display") stopPresentation();
  if (target === "agent") loadAgent().catch((error) => toast(error.message));
  if (target === "home" || target === "activities") {
    loadActivities().catch((error) => toast(error.message));
    renderOverviewRecipes();
    renderOverviewActivities();
    renderOverviewFoods();
    renderMetrics();
  }
  if (target === "items") renderFoodList();
  if (target === "ledger") renderLedger();
  if (target === "ledger-list") renderLedgerList();
  if (target === "recipes") renderRecipes();
  if (target === "alerts") renderAlerts();
  if (target === "notifications") renderNotifications();
  if (target === "account" || target === "agent-settings" || target === "preferences") renderSettings();
  if (target === "member") renderMember();
  if (options.scroll !== false) window.scrollTo({ top: 0, behavior: target === "display" ? "auto" : "smooth" });
}

function dateKeyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function currentDateKey() {
  return state.today || dateKeyFromDate(new Date());
}

function offsetDateKey(key, days) {
  const date = dateFromKey(key);
  if (!date) return "";
  date.setDate(date.getDate() + Number(days));
  return dateKeyFromDate(date);
}

function formatFoodDate(key) {
  const date = dateFromKey(key);
  if (!date) return "";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function renderCategoryPicker() {
  $("#categoryPicker").innerHTML = CATEGORY_OPTIONS.map(([name, icon]) => `
    <button class="category-option" type="button" role="option" aria-selected="false" data-category="${name}">
      <span aria-hidden="true">${icon}</span><span>${name}</span>
    </button>
  `).join("");
}

function setCategory(value) {
  const category = String(value || "");
  const option = CATEGORY_OPTIONS.find(([name]) => name === category);
  foodForm.elements.category.value = category;
  $("#selectedCategoryIcon").textContent = option?.[1] || (category ? "📦" : "＋");
  $("#selectedCategoryText").textContent = category || "请选择分类";
  document.querySelectorAll("[data-category]").forEach((button) => {
    const selected = button.dataset.category === category;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  if (category) clearFieldError("category");
}

function closeCategoryPicker() {
  $("#categoryPicker").classList.add("hidden");
  $("#categoryTrigger").setAttribute("aria-expanded", "false");
}

function toggleCategoryPicker() {
  const picker = $("#categoryPicker");
  const opening = picker.classList.contains("hidden");
  closeCalendar();
  picker.classList.toggle("hidden", !opening);
  $("#categoryTrigger").setAttribute("aria-expanded", String(opening));
}

function clearFieldError(name) {
  const error = document.querySelector(`[data-error-for="${name}"]`);
  if (!error) return;
  error.textContent = "";
  error.closest(".field-group")?.classList.remove("invalid");
  if (name === "expiresOn") error.closest(".expiry-panel")?.classList.remove("invalid");
}

function clearFoodFormErrors() {
  document.querySelectorAll("#foodForm .field-error").forEach((error) => {
    error.textContent = "";
  });
  document.querySelectorAll("#foodForm .invalid").forEach((field) => field.classList.remove("invalid"));
}

function setFieldError(name, text) {
  const error = document.querySelector(`[data-error-for="${name}"]`);
  if (!error) return;
  error.textContent = text;
  error.closest(".field-group")?.classList.add("invalid");
  if (name === "expiresOn") error.closest(".expiry-panel")?.classList.add("invalid");
}

function updateDatePresets() {
  const selected = foodForm.elements.expiresOn.value;
  document.querySelectorAll("[data-date-offset]").forEach((button) => {
    button.classList.toggle("selected", selected === offsetDateKey(currentDateKey(), Number(button.dataset.dateOffset)));
  });
}

function updateShelfLifePresets() {
  const selected = foodForm.elements.shelfLifeDays.value;
  document.querySelectorAll("[data-shelf-life]").forEach((button) => {
    button.classList.toggle("selected", selected === button.dataset.shelfLife);
  });
}

function updateCalculatedExpiry() {
  const output = $("#calculatedExpiry");
  if (!output) return;
  const startDate = foodForm.elements.startDate.value;
  const daysText = foodForm.elements.shelfLifeDays.value;
  const days = Number(daysText);
  if (startDate && daysText !== "" && Number.isInteger(days) && days >= 0 && days <= 36500) {
    const expiry = offsetDateKey(startDate, days);
    output.textContent = `预计到期：${formatFoodDate(expiry)}`;
    output.classList.add("ready");
  } else {
    output.textContent = "填写起始日期和有效天数后显示预计到期日";
    output.classList.remove("ready");
  }
}

function setDateValue(name, value) {
  foodForm.elements[name].value = value || "";
  const label = document.querySelector(`[data-date-label="${name}"]`);
  if (label) label.textContent = value ? formatFoodDate(value) : name === "expiresOn" ? "选择其他日期" : "选择日期";
  clearFieldError(name);
  if (name === "expiresOn") updateDatePresets();
  if (name === "startDate") updateCalculatedExpiry();
}

function setExpiryMode(mode, { initialize = false } = {}) {
  expiryMode = mode === "calculated" ? "calculated" : "direct";
  document.querySelectorAll("[data-expiry-mode]").forEach((button) => {
    const active = button.dataset.expiryMode === expiryMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  document.querySelectorAll("[data-expiry-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.expiryPanel !== expiryMode);
  });
  if (expiryMode === "calculated" && !initialize && !foodForm.elements.startDate.value) {
    setDateValue("startDate", currentDateKey());
  }
  closeCalendar();
  clearFieldError("expiresOn");
  clearFieldError("startDate");
  clearFieldError("shelfLifeDays");
  updateCalculatedExpiry();
}

function closeCalendar() {
  activeCalendarTarget = null;
  $("#foodCalendar").classList.add("hidden");
  document.querySelectorAll("[data-date-target]").forEach((button) => button.setAttribute("aria-expanded", "false"));
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstDay = new Date(year, month, 1, 12).getDay();
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const selected = activeCalendarTarget ? foodForm.elements[activeCalendarTarget].value : "";
  const today = currentDateKey();
  $("#calendarMonth").textContent = `${year} 年 ${month + 1} 月`;
  const cells = Array.from({ length: firstDay }, () => `<span class="calendar-spacer"></span>`);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dateKeyFromDate(new Date(year, month, day, 12));
    const classes = ["calendar-day", key === today ? "today" : "", key === selected ? "selected" : ""].filter(Boolean).join(" ");
    cells.push(`<button class="${classes}" type="button" data-calendar-date="${key}" aria-label="${formatFoodDate(key)}">${day}</button>`);
  }
  $("#calendarGrid").innerHTML = cells.join("");
}

function openCalendar(target) {
  closeCategoryPicker();
  activeCalendarTarget = target;
  const selectedDate = dateFromKey(foodForm.elements[target].value || currentDateKey());
  calendarCursor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12);
  $("#foodCalendar").classList.remove("hidden");
  document.querySelectorAll("[data-date-target]").forEach((button) => {
    button.setAttribute("aria-expanded", String(button.dataset.dateTarget === target));
  });
  renderCalendar();
}

function foodEditorStateKey() {
  return JSON.stringify({
    id: foodForm.elements.id.value,
    name: foodForm.elements.name.value,
    category: foodForm.elements.category.value,
    quantityText: foodForm.elements.quantityText.value,
    location: foodForm.elements.location.value,
    expiryMode,
    expiresOn: foodForm.elements.expiresOn.value,
    startDate: foodForm.elements.startDate.value,
    shelfLifeDays: foodForm.elements.shelfLifeDays.value
  });
}

function finishFoodEditorClose() {
  foodEditor.overlay.classList.add("hidden");
  foodEditor.overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  document.removeEventListener("keydown", handleFoodEditorKeyDown);
  closeCategoryPicker();
  closeCalendar();
  state.editingId = null;
  foodEditorPreviousFocus?.focus?.({ preventScroll: true });
  foodEditorPreviousFocus = null;
}

async function requestFoodEditorClose({ force = false } = {}) {
  if (!force && foodEditorStateKey() !== foodEditorBaseline) {
    const discard = await confirmDialog({
      eyebrow: "尚未保存",
      title: "要放弃这次修改吗？",
      body: "关闭后，本次填写的内容不会保存。",
      confirmText: "放弃修改",
      tone: "danger"
    });
    if (!discard) return;
  }
  finishFoodEditorClose();
}

function handleFoodEditorKeyDown(event) {
  if (foodEditor.overlay.classList.contains("hidden") || !dialog.overlay.classList.contains("hidden")) return;
  if (event.key === "Escape") {
    if (!$("#categoryPicker").classList.contains("hidden")) closeCategoryPicker();
    else if (!$("#foodCalendar").classList.contains("hidden")) closeCalendar();
    else requestFoodEditorClose();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...foodEditor.panel.querySelectorAll("button:not([disabled]), input:not([disabled])")]
    .filter((element) => element.offsetParent !== null && element.type !== "hidden");
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openFoodEditor(item = null, trigger = document.activeElement) {
  closeActiveDialog?.(false);
  foodForm.reset();
  clearFoodFormErrors();
  closeCategoryPicker();
  closeCalendar();
  state.editingId = item?.id ?? null;
  foodForm.elements.id.value = item?.id ?? "";
  foodForm.elements.name.value = item?.name || "";
  foodForm.elements.quantityText.value = item?.quantityText || "";
  foodForm.elements.location.value = item?.location || "";
  setCategory(item?.category || "");
  setDateValue("expiresOn", item?.expiresOn || "");
  setDateValue("startDate", item?.startDate || "");
  foodForm.elements.shelfLifeDays.value = item?.shelfLifeDays ?? "";
  updateShelfLifePresets();
  setExpiryMode(item?.startDate && item?.shelfLifeDays !== null ? "calculated" : "direct", { initialize: true });
  if (foodEditor.title) foodEditor.title.textContent = item ? "编辑物品" : "添加物品";
  if (foodEditor.hint) foodEditor.hint.textContent = item ? "修改后会同步更新概览和墨水屏内容。" : "填写物品名称、分类和到期信息即可。";
  if (foodEditor.save) foodEditor.save.textContent = item ? "保存修改" : "添加物品";
  foodEditorPreviousFocus = trigger;
  if (foodEditor.overlay) foodEditor.overlay.classList.remove("hidden");
  if (foodEditor.overlay) foodEditor.overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  document.addEventListener("keydown", handleFoodEditorKeyDown);
  foodEditorBaseline = foodEditorStateKey();
  window.requestAnimationFrame(() => foodForm.elements.name.focus({ preventScroll: true }));
}

function validateFoodForm() {
  clearFoodFormErrors();
  const focusTargets = [];
  if (!foodForm.elements.name.value.trim()) {
    setFieldError("name", "请输入物品名称");
    focusTargets.push(foodForm.elements.name);
  }
  if (!foodForm.elements.category.value) {
    setFieldError("category", "请选择物品分类");
    focusTargets.push($("#categoryTrigger"));
  }
  if (expiryMode === "direct") {
    if (!foodForm.elements.expiresOn.value) {
      setFieldError("expiresOn", "请选择到期日期");
      focusTargets.push(document.querySelector('[data-date-target="expiresOn"]'));
    }
  } else {
    if (!foodForm.elements.startDate.value) {
      setFieldError("startDate", "请选择起始日期");
      focusTargets.push(document.querySelector('[data-date-target="startDate"]'));
    }
    const value = foodForm.elements.shelfLifeDays.value;
    const days = Number(value);
    if (value === "") {
      setFieldError("shelfLifeDays", "请输入有效天数");
      focusTargets.push(foodForm.elements.shelfLifeDays);
    } else if (!Number.isInteger(days) || days < 0 || days > 36500) {
      setFieldError("shelfLifeDays", "请输入 0 至 36500 之间的整数");
      focusTargets.push(foodForm.elements.shelfLifeDays);
    }
  }
  focusTargets[0]?.focus?.({ preventScroll: false });
  return focusTargets.length === 0;
}

async function initialize() {
  const result = await api("/api/auth/me");
  if (result.user) {
    await enterWorkspace(result.user);
    return;
  }
  // 未登录但携带邀请链接：自动切换到注册并回填邀请码
  if (state.pendingInviteCode) {
    setAuthMode("register");
    const input = $("#registerInvitationCode");
    if (input) input.value = state.pendingInviteCode;
  }
}

async function enterWorkspace(user) {
  state.user = user;
  document.body.classList.add("is-logged-in");
  loginPanel.classList.add("hidden");
  workspace.classList.remove("hidden");
  $("#appTopbar")?.classList.remove("hidden");
  $("#mainNav").classList.remove("hidden");
  $("#sessionActions").classList.remove("hidden");
  const accountName = $("#accountName");
  if (accountName) accountName.textContent = displayName(user);
  const welcomeUser = $("#welcomeUser");
  if (welcomeUser) welcomeUser.textContent = displayName(user);
  await loadHousehold();
  try {
    await Promise.all([loadFoods(), loadActivities(), loadDevices(), loadUsers(), loadTokens(), loadAiSettings(), loadVoiceSettings(), loadConversations()]);
  } catch (e) {
    console.warn("[EW] Promise.all error:", e?.message);
  }
  const name = displayName(user);
  const menuName = $("#menuName");
  if (menuName) menuName.textContent = name;
  const menuRole = $("#menuRole");
  if (menuRole) menuRole.textContent = state.household?.currentRole === "owner" ? "家庭创建者" : "家庭成员";
  const menuAvatar = $("#menuAvatar");
  if (menuAvatar) menuAvatar.textContent = (name || "食").slice(0, 1);
  const userNameEl = $("#userName");
  if (userNameEl) userNameEl.textContent = name;
  const userAvatarEl = $("#userAvatar");
  if (userAvatarEl) userAvatarEl.textContent = (name || "食").slice(0, 1);
  const mobileUserNameEl = $("#mobileUserName");
  if (mobileUserNameEl) mobileUserNameEl.textContent = name;
  const mobileUserAvatarEl = $("#mobileUserAvatar");
  if (mobileUserAvatarEl) mobileUserAvatarEl.textContent = (name || "食").slice(0, 1);
  const LEGACY_VIEWS = { overview: "home", foods: "items", devices: "ledger", users: "alerts", agent: "agent" };
  const initialView = LEGACY_VIEWS[location.hash.slice(1)] || location.hash.slice(1);
  renderLedger();
  renderRecipes();
  renderAlerts();
  setView(initialView || "home", { updateHash: false, scroll: false });
  await handlePendingHouseholdInvite();
}

function householdRoleText(role) {
  return role === "owner" ? "家庭创建者" : "家庭成员";
}

function renderHouseholdMember(member) {
  const canRemove = state.household?.permissions.manageMembers && member.householdRole === "member";
  return `<article class="household-member">
    <strong>${escapeHtml(member.displayName)}</strong>
    <small>${escapeHtml(member.email || member.login)}</small>
    <span class="role-pill ${member.householdRole === "owner" ? "admin" : "member"}">${escapeHtml(householdRoleText(member.householdRole))}</span>
    ${canRemove ? `<button type="button" data-remove-household-member="${member.id}">移除</button>` : ""}
  </article>`;
}

async function loadHousehold() {
  const result = await api("/api/household");
  state.household = result;
  const householdName = $("#householdName");
  if (householdName) householdName.textContent = result.household.name;
  const householdRole = $("#householdRole");
  if (householdRole) {
    householdRole.textContent = householdRoleText(result.currentRole);
    householdRole.className = `role-pill ${result.currentRole === "owner" ? "admin" : "member"}`;
  }
  const householdHint = $("#householdHint");
  if (householdHint) householdHint.textContent = result.currentRole === "owner"
    ? "你可以邀请家人、管理成员和配对设备，所有成员共同维护物品。"
    : "你和家人共同维护物品；成员邀请和设备配对由家庭创建者管理。";
  const householdMembers = $("#householdMembers");
  if (householdMembers) {
    householdMembers.innerHTML = result.members.length
      ? result.members.map(renderHouseholdMember).join("")
      : `<div class="member-empty muted">还没有家庭成员，邀请家人一起管理冰箱吧。</div>`;
  }
  const createInvite = $("#createHouseholdInvite");
  if (createInvite) createInvite.classList.toggle("hidden", !result.permissions.manageMembers);
  const leaveHousehold = $("#leaveHousehold");
  if (leaveHousehold) leaveHousehold.classList.toggle("hidden", !result.permissions.leaveHousehold);
  const pairingHint = $("#devicePairingHint");
  if (pairingHint) pairingHint.textContent = result.permissions.manageDevices
    ? "先生成一次性配对码，再在 ESP32 配网页填写该码。配对成功后设备会关联到当前家庭。"
    : "设备由家庭创建者管理；你仍可查看设备状态和共享的屏幕画面。";
}

async function handlePendingHouseholdInvite() {
  const code = state.pendingInviteCode;
  if (!code) return;
  try {
    const invite = await api(`/api/household/invites/inspect?code=${encodeURIComponent(code)}`);
    const confirmed = await confirmDialog({
      eyebrow: "家庭邀请",
      title: `加入“${invite.household.name}”？`,
      body: `${invite.inviter.displayName} 邀请你共同管理家庭物品和屏幕内容。加入后，你当前的空家庭会被替换。`,
      confirmText: "加入家庭"
    });
    if (!confirmed) return;
    await api("/api/household/invites/accept", { method: "POST", body: JSON.stringify({ code }) });
    state.pendingInviteCode = "";
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("invite");
    history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    await Promise.all([loadHousehold(), loadFoods(), loadActivities(), loadDevices(), loadUsers()]);
    toast("已加入家庭");
  } catch (error) {
    toast(error.code === "household_not_empty" ? "当前家庭已有物品或设备，暂时无法加入其他家庭" : error.message);
  }
}

const ACTIVITY_GLYPHS = {
  food_created: "+",
  food_updated: "↻",
  food_deleted: "−",
  household_invite_created: "✦",
  household_member_joined: "人",
  household_member_removed: "×",
  household_member_left: "←",
  device_paired: "▣"
};

function activityActor(activity) {
  return activity.actor?.displayName || "系统";
}

function activitySource(activity) {
  const labels = { agent: "物品助手", mcp: "MCP", web: "网页" };
  return labels[activity.metadata?.source] || "";
}

function relativeActivityTime(value) {
  const timestamp = new Date(value).getTime();
  const elapsed = Date.now() - timestamp;
  if (!Number.isFinite(timestamp) || elapsed < 0) return formatTime(value);
  if (elapsed < 60 * 1000) return "刚刚";
  if (elapsed < 60 * 60 * 1000) return `${Math.floor(elapsed / (60 * 1000))} 分钟前`;
  if (elapsed < 24 * 60 * 60 * 1000) return `${Math.floor(elapsed / (60 * 60 * 1000))} 小时前`;
  if (elapsed < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(elapsed / (24 * 60 * 60 * 1000))} 天前`;
  return new Date(value).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function activityDayKey(value) {
  return dateKeyFromDate(new Date(value));
}

function activityDayLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const todayKey = dateKeyFromDate(today);
  const yesterdayKey = dateKeyFromDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12));
  const key = activityDayKey(value);
  if (key === todayKey) return "今天";
  if (key === yesterdayKey) return "昨天";
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}

function activityIcon(activity) {
  return `<span class="activity-type-icon ${escapeHtml(activity.type)}" aria-hidden="true">${escapeHtml(ACTIVITY_GLYPHS[activity.type] || "·")}</span>`;
}

function renderOverviewActivities() {
  const overview = $("#overviewActivities");
  if (!overview) return; // 首页不再展示"家庭动态"概览
  const items = state.activities.slice(0, 4);
  if (!items.length) {
    overview.innerHTML = `<div class="activity-empty">
      <div class="activity-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 11a2 2 0 0 0 4 0h-4Z"/></svg></div>
      <strong>还没有家人动态</strong>
      <p>家庭成员对物品、菜谱和台账的操作会显示在这里。</p>
    </div>`;
    return;
  }
  overview.innerHTML = items.map((activity) => `
    <article class="activity-summary-item">
      <span class="activity-summary-avatar" aria-hidden="true">${escapeHtml((activityActor(activity) || "食").slice(0, 1))}</span>
      <div class="activity-summary-copy">
        <strong>${escapeHtml(activityActor(activity))} ${escapeHtml(activity.title)}</strong>
        <span>${escapeHtml(activity.detail || relativeActivityTime(activity.createdAt))}${activity.detail ? ` · ${escapeHtml(relativeActivityTime(activity.createdAt))}` : ""}</span>
      </div>
    </article>
  `).join("");
}

function renderActivityFeed() {
  if (!$("#activityFeed")) return; // 家庭动态页已删除，跳过渲染
  $("#activityCount").textContent = `${state.activities.length}${state.activitiesHasMore ? "+" : ""} 条动态`;
  if (!state.activities.length) {
    $("#activityFeed").innerHTML = `<div class="activity-empty"><div>
      <span class="activity-heading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 11a2 2 0 0 0 4 0h-4Z"/></svg></span>
      <strong>还没有家庭动态</strong>
      <p>从现在开始，家庭成员对物品、成员和设备的操作会按时间记录在这里。</p>
    </div></div>`;
    return;
  }
  const groups = [];
  state.activities.forEach((activity) => {
    const key = activityDayKey(activity.createdAt);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      group = { key, label: activityDayLabel(activity.createdAt), items: [] };
      groups.push(group);
    }
    group.items.push(activity);
  });
  const feed = groups.map((group) => `<section class="activity-day" aria-label="${escapeHtml(group.label)}">
    <h2 class="activity-day-title">${escapeHtml(group.label)}</h2>
    ${group.items.map((activity) => {
      const source = activitySource(activity);
      return `<article class="activity-item">
        ${activityIcon(activity)}
        <div class="activity-item-copy">
          <div class="activity-item-meta"><strong>${escapeHtml(activityActor(activity))}</strong>${source ? `<span>通过${escapeHtml(source)}</span>` : ""}</div>
          <h3>${escapeHtml(activity.title)}</h3>
          ${activity.detail ? `<p>${escapeHtml(activity.detail)}</p>` : ""}
        </div>
        <time datetime="${escapeHtml(activity.createdAt)}" title="${escapeHtml(formatTime(activity.createdAt))}">${escapeHtml(relativeActivityTime(activity.createdAt))}</time>
      </article>`;
    }).join("")}
  </section>`).join("");
  $("#activityFeed").innerHTML = `${feed}${state.activitiesHasMore ? `<div class="activity-load-more"><button class="quiet" type="button" data-load-activities>加载更早动态</button></div>` : ""}`;
}

async function loadActivities({ append = false } = {}) {
  if (!state.user) return; // 未登录时跳过，避免登出瞬间 hashchange 触发 401
  const beforeId = append ? state.activities.at(-1)?.id : null;
  const query = new URLSearchParams({ limit: "30" });
  if (beforeId) query.set("beforeId", String(beforeId));
  const result = await api(`/api/activities?${query}`);
  state.activities = append ? [...state.activities, ...result.items] : result.items;
  state.activitiesHasMore = result.hasMore;
  renderOverviewActivities();
  renderActivityFeed();
  updateNotificationBadgeFromState();
  if (state.view === "display") renderPresentation();
}

async function loadFoods() {
  const result = await api("/api/foods");
  state.foods = result.items;
  state.today = result.today;
  const currentIds = new Set(result.items.map((item) => item.id));
  state.foodList.selectedIds = new Set([...state.foodList.selectedIds].filter((id) => currentIds.has(id)));
  if (!currentIds.has(state.foodList.expandedId)) state.foodList.expandedId = null;
  updateLocationChoices();
  const foodCountEl = $("#foodCount");
  if (foodCountEl) foodCountEl.textContent = `${result.items.length} 项物品`;
  const todayTextEl = $("#todayText");
  if (todayTextEl) todayTextEl.textContent = `今天 ${result.today} · 按到期紧急度排序`;
  renderMetrics();
  renderFoodList();
  renderOverviewFoods();
  updateNotificationBadgeFromState();
  if (state.view === "display") renderPresentation();
}

function updateLocationChoices() {
  const locations = [...new Set(state.foods.map((item) => item.location).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const suggestions = $("#locationChoices");
  if (suggestions) suggestions.innerHTML = locations.map((location) => `<option value="${escapeHtml(location)}"></option>`).join("");
  const selected = locations.includes(state.foodList.location) ? state.foodList.location : "";
  state.foodList.location = selected;
  const filter = $("#foodLocationFilter");
  if (filter) {
    filter.innerHTML = `<option value="">全部分区</option>${locations.map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join("")}`;
    filter.value = selected;
  }
}

function updateBreadcrumb(view) {
  const map = {
    home: [],
    items: [{ l: "库存", v: "items" }],
    ledger: [{ l: "台账", v: "ledger" }],
    "ledger-list": [{ l: "台账", v: "ledger" }, { l: "明细" }],
    alerts: [{ l: "预警", v: "alerts" }],
    recipes: [{ l: "菜谱", v: "recipes" }],
    "recipes-detail": [{ l: "菜谱", v: "recipes" }, { l: "详情" }],
    notifications: [{ l: "通知" }],
    account: [{ l: "账户管理" }],
    "agent-settings": [{ l: "Agent 设置" }],
    preferences: [{ l: "偏好设置" }],
    agent: [{ l: "物品助手" }],
    display: [{ l: "全屏显示" }]
  };
  const items = map[view] || [];
  const nav = $("#appBreadcrumb");
  if (!nav) return;
  if (!items.length) {
    nav.classList.add("hidden");
    nav.innerHTML = "";
    return;
  }
  nav.classList.remove("hidden");
  nav.innerHTML = '<a href="#home" class="breadcrumb-link">首页</a>' + items.map((it, i) => {
    const isLast = i === items.length - 1;
    const sep = `<span class="breadcrumb-sep" aria-hidden="true">›</span>`;
    const body = it.v ? `<a href="#${it.v}" class="breadcrumb-link">${escapeHtml(it.l)}</a>` : `<span class="breadcrumb-current">${escapeHtml(it.l)}</span>`;
    return `${sep}${body}`;
  }).join("");
}

function renderMetrics() {
  const fresh = state.foods.filter((food) => food.status === "normal").length;
  const expired = state.foods.filter((food) => food.status === "expired").length;
  const expiring = state.foods.filter((food) => food.status === "expiring").length;
  const freshEl = $("#freshCount");
  const expiringEl = $("#expiringCount");
  const expiredEl = $("#expiredCount");
  if (freshEl) freshEl.textContent = fresh;
  if (expiringEl) expiringEl.textContent = expiring;
  if (expiredEl) expiredEl.textContent = expired;
  const total = state.foods.length;
  const freshPct = total ? Math.round((fresh / total) * 100) : 0;
  const freshCard = freshEl?.parentElement;
  const freshSub = freshCard?.querySelector("small");
  if (freshSub) freshSub.textContent = freshPct ? `${freshPct}% · 3 天以上` : "3 天以上";
  // 本月支出（demo 台账最后一个月）
  const monthSpend = $("#monthSpend");
  if (monthSpend) {
    const last = demo.ledger[demo.ledger.length - 1];
    monthSpend.textContent = last ? `¥${last.buy.toLocaleString("zh-CN")}` : "¥0";
  }
  const spendTrend = $("#spendTrend");
  if (spendTrend) {
    const last = demo.ledger[demo.ledger.length - 1];
    const prev = demo.ledger[demo.ledger.length - 2];
    if (last && prev) {
      const delta = prev.buy ? Math.round(((last.buy - prev.buy) / prev.buy) * 100) : 0;
      spendTrend.textContent = delta <= 0 ? `↓${Math.abs(delta)}%` : `↑${delta}%`;
      spendTrend.className = delta <= 0 ? "trend-down" : "trend-up";
    } else {
      spendTrend.textContent = "--";
    }
  }
}

function renderOverviewRecipes() {
  const grid = $("#overviewRecipes");
  if (!grid) return;
  const recipes = demo.recipesBase.slice(0, 3);
  grid.innerHTML = recipes.map((r) => `
    <article class="card recipe card-hover" style="grid-column:span 4" role="button" tabindex="0" data-recipe="${escapeHtml(r.t)}">
      <div class="recipe-img" style="background:${r.g}"><span class="tag">${escapeHtml(r.tag || "")}</span><svg class="ic ic-28"><use href="#i-book"/></svg></div>
      <div class="recipe-b"><b>${escapeHtml(r.t)}</b><span class="small muted-2">${escapeHtml(r.m)}</span>${r.c?.length ? `<div class="chips">${r.c.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("")}</div>` : ""}</div>
    </article>`).join("");
}

function categoryGlyph(category) {
  return CATEGORY_OPTIONS.find(([label]) => label === category)?.[1] || "📦";
}

function renderPresentationClock() {
  const now = new Date();
  $("#displayTime").textContent = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  $("#displayDate").textContent = now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
}

function renderPresentation() {
  const total = state.foods.length;
  const expired = state.foods.filter((food) => food.status === "expired").length;
  const expiring = state.foods.filter((food) => food.status === "expiring").length;
  const fresh = total - expired - expiring;
  const urgent = expired + expiring;
  const freshness = total ? Math.round((fresh / total) * 100) : 100;
  const headline = expired
    ? `有 ${expired} 项物品需要尽快处理`
    : expiring
      ? `有 ${expiring} 项物品即将到期`
      : total
        ? "今天的物品状态很好"
        : "从添加第一项物品开始";
  const summary = urgent
    ? "优先查看下面的提醒，及时使用、补充或处理临期物品。"
    : total
      ? "当前没有临期提醒，可以按计划使用。"
      : "记录物品后，这里会自动整理到期顺序、地点和分类构成。";

  $("#displayHouseholdName").textContent = state.household?.household?.name || "家庭物品";
  $("#displayHeadline").textContent = headline;
  $("#displaySummary").textContent = summary;
  $("#displayTotalCount").textContent = total;
  $("#displayExpiredCount").textContent = expired;
  $("#displayExpiringCount").textContent = expiring;
  $("#displayFreshnessText").textContent = total ? `${freshness}% 状态良好` : "等待记录";
  $("#displayFreshnessBar").style.width = `${freshness}%`;
  $("#displayUpdatedAt").textContent = `${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} 更新`;

  $("#displayFoods").innerHTML = state.foods.length
    ? state.foods.slice(0, 6).map((item) => `<article class="ambient-food ${item.status}">
        <span class="ambient-food-glyph" aria-hidden="true">${categoryGlyph(item.category)}</span>
        <span class="ambient-food-copy"><strong>${escapeHtml(item.name)}</strong><span>${[item.category, item.location, item.quantityText].filter(Boolean).map(escapeHtml).join(" · ")}</span></span>
        <span class="ambient-food-actions">
          <span class="ambient-food-status">${escapeHtml(compactStatusText(item))}</span>
          ${item.status === "expired" || item.status === "expiring" ? `<button type="button" class="ambient-food-handle" data-display-handle="${item.id}">快速处理</button>` : ""}
        </span>
      </article>`).join("")
    : `<div class="ambient-food-empty">家里还没有记录<br>添加物品后会按紧急程度展示</div>`;

  const categories = new Map();
  state.foods.forEach((item) => categories.set(item.category, (categories.get(item.category) || 0) + 1));
  const displayCategories = $("#displayCategories");
  if (displayCategories) displayCategories.innerHTML = categories.size
    ? [...categories.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))
      .slice(0, 7)
      .map(([category, count]) => `<span class="ambient-category"><span aria-hidden="true">${categoryGlyph(category)}</span>${escapeHtml(category)} <strong>${count}</strong></span>`)
      .join("")
    : `<span class="ambient-category">暂无物品分类</span>`;

  const next = state.foods[0];
  const displayNextFood = $("#displayNextFood");
  if (displayNextFood) displayNextFood.textContent = next?.name || "暂无物品";
  const displayNextFoodMeta = $("#displayNextFoodMeta");
  if (displayNextFoodMeta) displayNextFoodMeta.textContent = next
    ? `${[next.category, next.location, next.quantityText].filter(Boolean).join(" · ")} · ${statusText(next)}`
    : "添加物品后会在这里显示提醒。";

  const activities = state.activities.slice(0, 3);
  const displayActivityCount = $("#displayActivityCount");
  if (displayActivityCount) displayActivityCount.textContent = `${state.activities.length}${state.activitiesHasMore ? "+" : ""} 条`;
  const displayActivities = $("#displayActivities");
  if (displayActivities) displayActivities.innerHTML = activities.length
    ? activities.map((activity) => `<article class="ambient-activity">
        <span class="ambient-activity-icon ${escapeHtml(activity.type)}" aria-hidden="true">${escapeHtml(ACTIVITY_GLYPHS[activity.type] || "·")}</span>
        <span class="ambient-activity-copy">
          <strong>${escapeHtml(activityActor(activity))} ${escapeHtml(activity.title)}</strong>
          <small>${escapeHtml(activity.detail || "家庭信息已更新")}</small>
        </span>
        <time datetime="${escapeHtml(activity.createdAt)}">${escapeHtml(relativeActivityTime(activity.createdAt))}</time>
      </article>`).join("")
    : `<div class="ambient-activity-empty">还没有家庭动态</div>`;
}

function updateWakeStatus(text, active = false) {
  const wakeStatus = $("#displayWakeStatus");
  if (wakeStatus) {
    wakeStatus.textContent = text;
    wakeStatus.classList.toggle("active", active);
  }
}

function syncFullscreenButton() {
  const button = $("#displayFullscreen");
  if (!button) return;
  const supported = typeof document.documentElement.requestFullscreen === "function";
  button.classList.toggle("hidden", !supported);
  button.textContent = document.fullscreenElement ? "退出全屏" : "进入全屏";
}

async function requestDisplayWakeLock() {
  if (!("wakeLock" in navigator)) {
    updateWakeStatus("浏览器未提供常亮");
    return;
  }
  if (displayWakeLock && !displayWakeLock.released) return;
  try {
    displayWakeLock = await navigator.wakeLock.request("screen");
    updateWakeStatus("屏幕已保持常亮", true);
    displayWakeLock.addEventListener("release", () => {
      displayWakeLock = null;
      if (state.view === "display") updateWakeStatus("常亮已暂停");
    }, { once: true });
  } catch {
    updateWakeStatus("请在系统中保持常亮");
  }
}

function startPresentation() {
  renderPresentationClock();
  renderPresentation();
  syncFullscreenButton();
  window.clearInterval(displayClockTimer);
  window.clearInterval(displayRefreshTimer);
  displayClockTimer = window.setInterval(renderPresentationClock, 30000);
  displayRefreshTimer = window.setInterval(refreshPresentationFoods, DISPLAY_REFRESH_MS);
  refreshPresentationFoods();
  requestDisplayWakeLock();
}

async function refreshPresentationFoods() {
  if (state.view !== "display" || !state.user) return;
  try {
    await Promise.all([loadFoods(), loadActivities()]);
    renderPresentation();
  } catch {
    updateWakeStatus("数据刷新失败");
  }
}

function stopPresentation() {
  window.clearInterval(displayClockTimer);
  window.clearInterval(displayRefreshTimer);
  displayClockTimer = null;
  displayRefreshTimer = null;
  if (displayWakeLock && !displayWakeLock.released) displayWakeLock.release().catch(() => {});
  displayWakeLock = null;
}

function statusText(item) {
  if (item.status === "expired") return `已过期 ${Math.abs(item.daysRemaining)} 天`;
  if (item.daysRemaining === 0) return "今天到期";
  return `${item.daysRemaining} 天`;
}

function renderPriorityFood(item) {
  return `<article class="priority-food">
    <strong>${escapeHtml(item.name)}</strong>
    <small>${[item.category, item.location, `到期 ${item.expiresOn}`].filter(Boolean).map(escapeHtml).join(" · ")}</small>
    <span class="tag ${item.status}">${escapeHtml(statusText(item))}</span>
  </article>`;
}

function renderOverviewFoods() {
  const grid = $("#overviewFoods");
  if (!grid) return;
  const priorityItems = state.foods
    .filter((item) => item.status !== "handled")
    .sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999))
    .slice(0, 4);
  grid.innerHTML = priorityItems.length
    ? priorityItems.map(renderPriorityFood).join("")
    : `<p class="muted">添加物品后，这里会优先展示即将到期的内容。</p>`;
}

const FOOD_LIST_GROUPS = [
  { status: "expired", label: "已过期" },
  { status: "expiring", label: "即将到期" },
  { status: "normal", label: "状态正常" }
];
const FOOD_LIST_MENU_LABELS = {
  status: { all: "全部状态", expired: "已过期", expiring: "即将到期", normal: "状态正常" },
  sort: { urgency: "紧急优先", name: "名称排序" }
};

function closeFoodListMenus({ restoreFocus = false } = {}) {
  let openTrigger = null;
  document.querySelectorAll(".food-list-menu").forEach((menu) => {
    const trigger = menu.querySelector(".food-filter-trigger");
    const popup = menu.querySelector(".food-filter-menu");
    if (trigger.getAttribute("aria-expanded") === "true") openTrigger = trigger;
    trigger.setAttribute("aria-expanded", "false");
    popup.classList.add("hidden");
  });
  if (restoreFocus && openTrigger) openTrigger.focus({ preventScroll: true });
}

function syncFoodListMenu(type, value) {
  const menu = $(`[data-food-menu="${type}"]`);
  menu.querySelector("[data-food-menu-label]").textContent = FOOD_LIST_MENU_LABELS[type][value];
  menu.querySelectorAll("[data-food-list-value]").forEach((option) => {
    option.setAttribute("aria-selected", String(option.dataset.foodListValue === value));
  });
}

function toggleFoodListMenu(type) {
  const menu = $(`[data-food-menu="${type}"]`);
  const trigger = menu.querySelector(".food-filter-trigger");
  const popup = menu.querySelector(".food-filter-menu");
  const shouldOpen = trigger.getAttribute("aria-expanded") !== "true";
  closeFoodListMenus();
  if (!shouldOpen || trigger.disabled) return;
  trigger.setAttribute("aria-expanded", "true");
  popup.classList.remove("hidden");
  window.requestAnimationFrame(() => popup.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true }));
}

function compactStatusText(item) {
  if (item.status === "expired") return `过期 ${Math.abs(item.daysRemaining)} 天`;
  if (item.daysRemaining === 0) return "今天";
  return `${item.daysRemaining} 天`;
}

function compactFoodDate(dateKey) {
  const parts = String(dateKey || "").split("-");
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : String(dateKey || "");
}

function visibleFoodItems() {
  const filter = state.foodList.filter;
  const notHandled = (item) => item.status !== "handled";
  let filtered;
  if (filter === "all") filtered = state.foods.filter(notHandled);
  else if (filter === "fresh") filtered = state.foods.filter((item) => notHandled(item) && item.daysRemaining > 3);
  else if (filter === "expiring") filtered = state.foods.filter((item) => notHandled(item) && item.daysRemaining >= 0 && item.daysRemaining <= 3);
  else if (filter === "expired") filtered = state.foods.filter((item) => notHandled(item) && item.daysRemaining < 0);
  else if (filter === "handled") filtered = state.foods.filter((item) => item.status === "handled");
  else filtered = state.foods.filter((item) => item.status === filter);
  if (state.foodList.location) filtered = filtered.filter((item) => item.location === state.foodList.location);
  const query = state.foodList.query.trim().toLocaleLowerCase();
  if (query) {
    filtered = filtered.filter((item) => [item.name, item.category, item.location, item.quantityText]
      .some((value) => String(value || "").toLocaleLowerCase().includes(query)));
  }
  if (state.foodList.sort === "name") {
    filtered.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }
  return filtered;
}

function renderFood(item) {
  const expanded = !state.foodList.managing && state.foodList.expandedId === item.id;
  const selected = state.foodList.selectedIds.has(item.id);
  const summary = `<span class="food-row-summary">
    <span class="food-row-primary"><strong>${escapeHtml(item.name)}</strong>${item.quantityText ? `<span>${escapeHtml(item.quantityText)}</span>` : ""}</span>
    <span class="food-row-meta">${[item.category, item.location, `到期 ${compactFoodDate(item.expiresOn)}`].filter(Boolean).map(escapeHtml).join(" · ")}</span>
  </span>`;
  if (state.foodList.managing) {
    return `<article class="food-list-row ${item.status} ${selected ? "selected" : ""}">
      <label class="food-row-select">
        <input type="checkbox" data-food-select="${item.id}" ${selected ? "checked" : ""}>
        <span class="sr-only">选择${escapeHtml(item.name)}</span>
      </label>
      ${summary}
      <span class="food-urgency ${item.status}">${escapeHtml(compactStatusText(item))}</span>
    </article>`;
  }
  return `<article class="food-list-row ${item.status} ${expanded ? "expanded" : ""}">
    <button class="food-row-toggle" type="button" data-food-expand="${item.id}" aria-expanded="${expanded}"${expanded ? ` aria-controls="food-details-${item.id}"` : ""}>
      ${summary}
      <span class="food-urgency ${item.status}">${escapeHtml(compactStatusText(item))}</span>
      <span class="food-row-chevron" aria-hidden="true">${expanded ? "⌃" : "⌄"}</span>
    </button>
    ${expanded ? `<div id="food-details-${item.id}" class="food-row-details">
      <dl>
        <div><dt>分类</dt><dd>${escapeHtml(item.category)}</dd></div>
        <div><dt>地点</dt><dd>${escapeHtml(item.location || "未填写")}</dd></div>
        <div><dt>到期日</dt><dd>${escapeHtml(item.expiresOn)}</dd></div>
        <div><dt>数量</dt><dd>${escapeHtml(item.quantityText || "未填写")}</dd></div>
      </dl>
      <div class="food-detail-actions">
        <button type="button" data-edit="${item.id}">编辑</button>
        <button type="button" class="delete" data-delete="${item.id}">删除</button>
      </div>
    </div>` : ""}
  </article>`;
}

function renderFoodGroup(group, items) {
  if (!items.length) return "";
  const labelId = `food-group-${group.status}`;
  return `<section class="food-group" aria-labelledby="${labelId}">
    <div class="food-group-label" id="${labelId}"><span>${group.label}</span><strong>${items.length}</strong></div>
    <div class="food-group-rows">${items.map(renderFood).join("")}</div>
  </section>`;
}

function inventoryStatus(item) {
  if (item.status === "handled") return "handled";
  if (item.status === "expired") return "expired";
  if (item.status === "expiring") return "expiring";
  return "fresh";
}

function inventoryStatusLabel(status) {
  return { fresh: "新鲜", expiring: "临期", expired: "过期", handled: "已处理" }[status] || status;
}

function renderFoodList() {
  const items = visibleFoodItems();
  const itemsCountEl = $("#itemsCount");
  if (itemsCountEl) itemsCountEl.textContent = items.length;
  const foodListSummary = $("#foodListSummary");
  if (foodListSummary) foodListSummary.textContent = `共 ${items.length} 条记录`;
  const foodManageToggle = $("#foodManageToggle");
  if (foodManageToggle) {
    foodManageToggle.textContent = state.foodList.managing ? "完成" : "管理";
    foodManageToggle.setAttribute("aria-pressed", String(state.foodList.managing));
  }
  const foodSearch = $("#foodSearch");
  if (foodSearch) foodSearch.disabled = state.foodList.managing;
  const foodLocationFilter = $("#foodLocationFilter");
  if (foodLocationFilter) foodLocationFilter.disabled = state.foodList.managing;
  syncFoodStatusTabs();
  if (state.foodList.managing) closeFoodListMenus();
  const managing = state.foodList.managing;
  const rows = items.map((item) => {
    const status = inventoryStatus(item);
    const handledAction = item.handledAction || null;
    const checkbox = managing
      ? `<td><label class="food-row-select"><input type="checkbox" data-food-select="${item.id}" ${state.foodList.selectedIds.has(item.id) ? "checked" : ""}><span class="sr-only">选择${escapeHtml(item.name)}</span></label></td>`
      : "";
    const expiry = item.expiresOn ? compactFoodDate(item.expiresOn) : "—";
    const days = item.daysRemaining;
    const handledLabel = { eat: "吃掉", cook: "做菜", discard: "丢弃" }[handledAction] || "已处理";
    const remainingText = status === "handled"
      ? `已处理 ${escapeHtml(handledLabel)}`
      : days == null ? "—"
        : days < 0 ? `已过期 ${Math.abs(days)} 天`
        : days === 0 ? "今天到期"
        : `还剩 ${days} 天`;
    const remainingTrackClass = status === "handled" ? "handled"
      : days < 0 ? "danger" : days <= 3 ? "warning" : "fresh";
    const remainingPercent = status === "handled" ? 100
      : days == null ? 0
      : days < 0 ? 100
      : days <= 3 ? 30 + days * 20
      : Math.min(100, 30 + days * 7);
    const handledPillMap = { eat: "已吃掉", cook: "已做菜", discard: "已丢弃" };
    const pillClass = status === "handled"
      ? (handledAction === "discard" ? "pill-discarded"
        : handledAction === "cook" ? "pill-cooked"
        : handledAction === "eat" ? "pill-eaten"
        : "pill-handled")
      : status === "expired" ? "pill-expired"
      : status === "expiring" ? "pill-expiring"
      : "pill-fresh";
    const pillLabel = status === "handled"
      ? (handledAction && handledPillMap[handledAction] ? handledPillMap[handledAction] : handledLabel)
      : status === "expired" ? "过期"
      : status === "expiring" ? "临期"
      : "新鲜";
    const actions = managing
      ? ""
      : status === "handled"
        ? `<td class="inventory-actions t-actions">
            <button class="btn btn-sm btn-soft btn-restore" type="button" data-item-restore="${item.id}">恢复</button>
            <button class="btn btn-sm btn-ghost btn-edit" type="button" data-edit="${item.id}" aria-label="编辑${escapeHtml(item.name)}">编辑</button>
            <button class="btn btn-sm btn-ghost btn-trash" type="button" data-delete="${item.id}" aria-label="删除${escapeHtml(item.name)}">删除</button>
          </td>`
        : `<td class="inventory-actions t-actions">
            <button class="btn btn-sm btn-soft btn-eat" type="button" data-item-eat="${item.id}">吃掉</button>
            <button class="btn btn-sm btn-ghost btn-cook" type="button" data-item-cook="${item.id}">做菜</button>
            <button class="btn btn-sm btn-discard btn-trash" type="button" data-item-discard="${item.id}">丢弃</button>
            <button class="btn btn-sm btn-ghost btn-edit" type="button" data-edit="${item.id}" aria-label="编辑${escapeHtml(item.name)}">编辑</button>
            <button class="btn btn-sm btn-ghost btn-trash" type="button" data-delete="${item.id}" aria-label="删除${escapeHtml(item.name)}">删除</button>
          </td>`;
    return `<tr class="${status}">
      ${checkbox}
      <td><div class="t-name"><span class="t-thumb"><svg class="ic ic-18"><use href="#i-box"/></svg></span><div><b>${escapeHtml(item.name)}</b>${item.category ? `<span>${escapeHtml(item.category)}</span>` : ""}</div></div></td>
      <td>${escapeHtml(item.quantityText || "—")}</td>
      <td class="num">${item.unitPrice != null ? "¥" + Number(item.unitPrice).toFixed(2) : "—"}</td>
      <td>${escapeHtml(item.location || "—")}</td>
      <td>
        <div class="t-expiry-date">${escapeHtml(expiry)}</div>
        <div class="t-expiry-remaining">
          <div class="t-expiry-track ${remainingTrackClass}" aria-hidden="true"><span style="width:${remainingPercent}%"></span></div>
          <span class="t-expiry-text">${remainingText}</span>
        </div>
      </td>
      <td><span class="pill ${pillClass}">${pillLabel}</span></td>
      ${actions}
    </tr>`;
  }).join("");
  const foodsEl = $("#foods");
  if (foodsEl) {
    foodsEl.classList.toggle("managing", managing);
    foodsEl.innerHTML = items.length
      ? `<table class="inventory-table table"><thead><tr>
          ${managing ? "<th></th>" : ""}
          <th>食材</th><th>数量</th><th class="num">单价</th><th>分区</th><th>保质期</th><th>状态</th>
          ${managing ? "" : "<th>操作</th>"}
        </tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="food-list-empty">${state.foods.length ? "没有符合筛选条件的食材。" : "尚未添加物品。"}</div>`;
  }

  const selectedCount = state.foodList.selectedIds.size;
  const foodBatchBar = $("#foodBatchBar");
  if (foodBatchBar) foodBatchBar.classList.toggle("hidden", !managing);
  const foodBatchCount = $("#foodBatchCount");
  if (foodBatchCount) foodBatchCount.textContent = `已选 ${selectedCount} 项`;
  const foodBatchDate = $("#foodBatchDate");
  if (foodBatchDate) foodBatchDate.disabled = selectedCount === 0;
  const foodBatchDelete = $("#foodBatchDelete");
  if (foodBatchDelete) foodBatchDelete.disabled = selectedCount === 0;
}

function syncFoodStatusTabs() {
  document.querySelectorAll(".food-status-tab").forEach((tab) => {
    const active = tab.dataset.foodFilter === state.foodList.filter;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

function setFoodManagement(managing) {
  state.foodList.managing = managing;
  state.foodList.expandedId = null;
  if (!managing) state.foodList.selectedIds.clear();
  renderFoodList();
}

function selectedFoodIds() {
  return [...state.foodList.selectedIds];
}

function openBatchFoodDate() {
  batchFoodDate.input.value = state.today || currentDateKey();
  batchFoodDate.overlay.classList.remove("hidden");
  batchFoodDate.overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  batchFoodDate.input.focus();
}

function closeBatchFoodDate() {
  batchFoodDate.overlay.classList.add("hidden");
  batchFoodDate.overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  $("#foodBatchDate").focus({ preventScroll: true });
}

async function deleteSelectedFoods() {
  const ids = selectedFoodIds();
  if (!ids.length) return;
  const confirmed = await confirmDialog({
    eyebrow: "批量删除",
    title: `确定删除所选 ${ids.length} 项物品吗？`,
    body: "删除后，这些物品会从家庭记录中移除，墨水屏下次刷新时同步更新。",
    confirmText: "删除",
    tone: "danger"
  });
  if (!confirmed) return;
  await api("/api/foods/batch", { method: "POST", body: JSON.stringify({ operation: "delete", ids }) });
  state.foodList.selectedIds.clear();
  await Promise.all([loadFoods(), loadActivities()]);
  toast(`已删除 ${ids.length} 项物品`);
}

async function updateSelectedFoodExpiry() {
  const ids = selectedFoodIds();
  const expiresOn = batchFoodDate.input.value;
  if (!ids.length || !expiresOn) return;
  batchFoodDate.save.disabled = true;
  try {
    await api("/api/foods/batch", { method: "POST", body: JSON.stringify({ operation: "update_expiry", ids, expiresOn }) });
    closeBatchFoodDate();
    state.foodList.selectedIds.clear();
    await Promise.all([loadFoods(), loadActivities()]);
    toast(`已更新 ${ids.length} 项物品的到期日`);
  } catch (error) {
    toast(error.message);
  } finally {
    batchFoodDate.save.disabled = false;
  }
}

async function loadDevices() {
  const result = await api("/api/devices");
  state.devices = result.devices;
  const devicesEl = $("#devices");
  if (devicesEl) devicesEl.innerHTML = result.devices.length
    ? result.devices.map(renderDevice).join("")
    : `<p class="muted">尚未绑定屏幕设备。</p>`;
  const recent = result.devices.find((device) => device.lastSeenAt) || result.devices[0];
  const overviewDeviceEl = $("#overviewDevice");
  if (overviewDeviceEl) overviewDeviceEl.innerHTML = recent
    ? `<strong>${escapeHtml(recent.serial)}</strong><span>${recent.lastSeenAt ? `最近同步 ${escapeHtml(formatTime(recent.lastSeenAt))}` : "已绑定，等待首次同步"}</span>`
    : `<strong>暂无已绑定设备</strong><span>${state.household?.permissions.manageDevices ? "前往设备页面生成配对码" : "请联系家庭创建者配对设备"}</span>`;
}

function renderDevice(device) {
  return `<article class="device">
    <strong>${escapeHtml(device.serial)}</strong>
    <span>${escapeHtml(device.panelProfile)} · ${device.lastSeenAt ? `最近同步 ${escapeHtml(formatTime(device.lastSeenAt))}` : "等待首次同步"}</span>
  </article>`;
}

async function loadUsers() {
  const result = await api("/api/users");
  state.user = result.currentUser;
  state.users = result.users;
  state.canManageUsers = result.canManageUsers;
  $("#userLayout")?.classList.toggle("is-admin", result.canManageUsers);
  $("#userCount")?.classList.toggle("hidden", !result.canManageUsers);
  $("#registeredUsersCard")?.classList.toggle("hidden", !result.canManageUsers);
  const userCount = $("#userCount");
  if (userCount) userCount.textContent = result.canManageUsers ? `${result.users.length} 位用户` : "";
  const userScope = $("#userScope");
  if (userScope) userScope.textContent = result.canManageUsers ? "管理员可查看全部账号" : "仅显示当前账号";
  const accountRole = $("#accountRole");
  if (accountRole) {
    accountRole.textContent = roleText(result.currentUser.role);
    accountRole.className = `role-pill ${result.currentUser.role === "admin" ? "admin" : "member"}`;
  }
  const accountPanel = $("#accountPanel");
  if (accountPanel) accountPanel.innerHTML = renderAccount(result.currentUser);
  const usersEl = $("#users");
  if (usersEl) usersEl.innerHTML = result.users.length
    ? result.users.map(renderUser).join("")
    : `<p class="muted">暂无用户。</p>`;
}

async function loadTokens() {
  const result = await api("/api/access-tokens");
  state.tokens = result.tokens;
  const accessTokensEl = $("#accessTokens");
  if (accessTokensEl) accessTokensEl.innerHTML = result.tokens.length ? result.tokens.map((token) => `
    <article class="token-row">
      <div><strong>${escapeHtml(token.name)}</strong><code>${escapeHtml(token.prefix)}…</code></div>
      <small>${token.revokedAt ? "已撤销" : `有效期至 ${escapeHtml(formatDate(token.expiresAt))}`}${token.lastUsedAt ? ` · 最近使用 ${escapeHtml(formatTime(token.lastUsedAt))}` : ""}</small>
      ${token.revokedAt ? "" : `<button class="delete" type="button" data-revoke-token="${token.id}">撤销</button>`}
    </article>
  `).join("") : `<p class="muted">尚未创建 MCP 访问令牌。</p>`;
}

async function loadAiSettings() {
  const result = await api("/api/agent/settings");
  state.aiSettings = result;
  const form = $("#aiSettingsForm");
  $("#aiSettingsState").textContent = result.configured
    ? `个人配置 ${result.apiKeyHint}`
    : result.systemConfigured ? "使用系统配置" : "未配置";
  $("#aiSettingsHint").textContent = result.configured
    ? "当前优先使用你的个人配置，不消耗系统输入额度；API Key 不会再次回显。"
    : result.systemConfigured
      ? "当前使用管理员提供的系统 Agent；填写个人配置后会自动优先使用你的 API Key。"
      : "系统 Agent 尚未配置，你可以填写自己的 API Key 后立即使用。";
  form.elements.openaiApiKey.value = "";
  form.elements.openaiApiKey.placeholder = result.configured
    ? `${result.apiKeyHint}（留空保留）`
    : "首次配置必填";
  form.elements.openaiModel.value = result.openaiModel || "deepseek-v4-flash";
  form.elements.openaiBaseUrl.value = result.openaiBaseUrl || "https://api.deepseek.com";
  // 已配置后默认隐藏首次配置提示，未配置时显示
  const presetTip = $("#aiPresetTip");
  if (presetTip) presetTip.classList.toggle("hidden", result.configured);
  $("#clearAiSettings").disabled = !result.configured;

  // 系统 Agent 设置卡片已从 UI 移除；仅当对应 DOM 仍存在时才执行，避免对 null 调用 classList 崩溃。
  const systemCard = $("#systemAiSettingsCard");
  const systemForm = $("#systemAiSettingsForm");
  if (systemCard && systemForm) {
    systemCard.classList.toggle("hidden", !state.user?.isAdmin);
    if (!state.user?.isAdmin) {
      state.systemAiSettings = { configured: result.systemConfigured };
      return;
    }

    const system = await api("/api/admin/agent/settings");
    state.systemAiSettings = system;
    $("#systemAiSettingsState").textContent = system.configured ? `已配置 ${system.apiKeyHint}` : "未配置";
    $("#systemAiSettingsHint").textContent = "这套配置供未设置个人 API Key 的注册用户使用，API Key 不会再次回显。";
    systemForm.elements.openaiApiKey.value = "";
    systemForm.elements.openaiApiKey.placeholder = system.configured
      ? `${system.apiKeyHint}（留空保留）`
      : "首次配置必填";
    systemForm.elements.openaiModel.value = system.openaiModel || "";
    systemForm.elements.openaiBaseUrl.value = system.openaiBaseUrl || "https://api.openai.com/v1";
    $("#clearSystemAiSettings").disabled = !system.configured;
  }
}

async function loadVoiceSettings() {
  try {
    const result = await api("/api/agent/voice-settings");
    state.voiceConfigured = result.configured;
    const browserSpeech = getBrowserSpeechRecognition();
    if (!result.configured && !browserSpeech) {
      [$("#agentForm"), $("#quickAgentForm")].forEach((form) => voiceControllers.get(form)?.switchMode("text"));
    }
    [$("#agentForm"), $("#quickAgentForm")].forEach(updateVoiceButtonAvailability);
  } catch (error) {
    console.warn("voice-settings 加载失败，回退到文字输入模式", error);
    state.voiceConfigured = false;
    if (!getBrowserSpeechRecognition()) {
      [$("#agentForm"), $("#quickAgentForm")].forEach((form) => voiceControllers.get(form)?.switchMode("text"));
    }
    [$("#agentForm"), $("#quickAgentForm")].forEach(updateVoiceButtonAvailability);
  }
}

async function loadConversations() {
  const result = await api("/api/agent/conversations");
  state.agentConfigured = result.configured;
  state.agentMode = result.mode;
  state.agentQuota = result.quota;
  state.conversations = result.conversations;
  const available = isAgentAvailable();
  const agentStatusText = result.mode === "personal"
    ? "个人 Agent 已连接 · 不消耗系统额度"
    : result.mode === "system"
      ? result.quota.remaining > 0 ? `系统 Agent 已连接 · 剩余 ${result.quota.remaining} 次` : "系统输入额度已用完"
      : "Agent 未配置";
  const agentStatusEl = $("#agentStatus");
  if (agentStatusEl) agentStatusEl.textContent = agentStatusText;
  if (agentStatusEl) agentStatusEl.title = agentStatusText;
  const quickAvail = $("#quickAgentAvailability");
  if (quickAvail) quickAvail.textContent = result.mode === "system" && result.quota.remaining <= 0
    ? "系统输入额度已用完，可填写个人 API Key 或联系管理员增加额度。"
    : result.mode === "unconfigured"
      ? "Agent 未配置，请填写个人 API Key 或联系管理员配置系统 Agent。"
      : "";
  setAgentFormAvailability($("#agentForm"), available);
  setAgentFormAvailability($("#quickAgentForm"), available);
  document.querySelectorAll("[data-quick-agent-prompt]").forEach((button) => {
    button.disabled = !available;
  });
  if (!result.conversations.some((conversation) => conversation.id === state.activeConversationId)) {
    state.activeConversationId = result.conversations[0]?.id || null;
  }
  renderConversations();
  if (state.activeConversationId) {
    await loadAgentMessages();
  } else {
    $("#agentMessages").innerHTML = `<div class="agent-empty"><strong>开始一段新对话</strong><span>点击“新对话”，或直接在下方输入你想做的事。</span></div>`;
  }
}

function renderConversations() {
  const activeConversation = state.conversations.find((conversation) => conversation.id === state.activeConversationId);
  $("#activeConversationTitle").textContent = activeConversation?.title || "新对话";
  $("#conversations").innerHTML = state.conversations.length ? state.conversations.map((conversation) => `
    <div class="conversation-row ${conversation.id === state.activeConversationId ? "active" : ""}">
      <button type="button" class="conversation-item ${conversation.id === state.activeConversationId ? "active" : ""}" data-conversation="${escapeHtml(conversation.id)}">
        <strong>${escapeHtml(conversation.title)}</strong><small>${escapeHtml(formatTime(conversation.updatedAt))}</small>
      </button>
      <button type="button" class="conversation-delete" data-delete-conversation="${escapeHtml(conversation.id)}" aria-label="删除对话：${escapeHtml(conversation.title)}">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  `).join("") : `<p class="muted">点击“新对话”开始。</p>`;
}

function setConversationListOpen(open) {
  const expanded = window.matchMedia("(max-width: 640px)").matches && open;
  $("#conversationPanel").classList.toggle("mobile-open", expanded);
  $("#conversationToggle").setAttribute("aria-expanded", String(expanded));
}

function renderPendingDetail(detail) {
  const actionLabels = { create: "新增", update: "修改", delete: "删除" };
  const metadata = [detail.category, detail.location, detail.quantityText, detail.expiresOn ? `到期 ${detail.expiresOn}` : ""].filter(Boolean);
  return `<li><strong>${escapeHtml(actionLabels[detail.operation] || "变更")}「${escapeHtml(detail.name || "物品")}」</strong>
    ${metadata.length ? `<span>${metadata.map(escapeHtml).join(" · ")}</span>` : ""}
  </li>`;
}

function renderAgentEvent(event, seenPendingIds = new Set()) {
  if (event.pendingAction) {
    const pending = event.pendingAction;
    const pendingKey = pending.resolution ? pending.id : JSON.stringify(pending.actions || pending.summary);
    if (seenPendingIds.has(pendingKey)) return "";
    seenPendingIds.add(pendingKey);
    if (pending.resolution) {
      return `<div class="agent-result ${pending.resolution === "cancelled" ? "cancelled" : ""}">${pending.resolution === "confirmed" ? "操作已确认执行" : "操作已取消"}</div>`;
    }
    const details = pending.details || [];
    const onlyDeletes = details.length > 0 && details.every((detail) => detail.operation === "delete");
    const confirmationTitle = onlyDeletes ? `确认删除以下 ${details.length} 项物品？` : "确认执行以下变更？";
    return `<article class="pending-action" data-pending-card="${escapeHtml(pending.id)}">
      <strong>${escapeHtml(confirmationTitle)}</strong><span>${escapeHtml(pending.summary)}</span>
      ${details.length ? `<ul class="pending-details">${details.map(renderPendingDetail).join("")}</ul>` : ""}
      <small>确认后才会执行 · 有效期至 ${escapeHtml(formatTime(pending.expiresAt))}</small>
      <div><button type="button" class="quiet" data-agent-cancel="${escapeHtml(pending.id)}">取消</button><button type="button" class="primary" data-agent-confirm="${escapeHtml(pending.id)}">确认执行</button></div>
    </article>`;
  }
  if (event.executed) return `<div class="agent-result">已完成 ${event.executed.length} 项变更</div>`;
  return "";
}

function renderAgentReasoning(reasoning) {
  if (!reasoning) return "";
  return `<details class="agent-reasoning">
    <summary>
      <svg class="agent-reasoning-bulb" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6m-5 3h4M8.6 14.8A6.5 6.5 0 1 1 15.4 14.8c-.9.7-1.4 1.6-1.4 2.2h-4c0-.6-.5-1.5-1.4-2.2Z"/></svg>
      <span class="agent-reasoning-label">思考完成</span>
      <svg class="agent-reasoning-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
    </summary>
    <div>${escapeHtml(reasoning).replaceAll("\n", "<br>")}</div>
  </details>`;
}

function renderAgentMessage(message, seenPendingIds = new Set()) {
  const events = message.metadata?.events || [];
  const image = message.metadata?.image
    ? `<div class="agent-message-image"><img src="${escapeHtml(message.metadata.image)}" alt="用户上传的图片"></div>`
    : "";
  const content = message.content
    ? `<div class="agent-message-body ${message.role === "assistant" ? "agent-markdown" : "agent-plain"}">${message.role === "assistant" ? renderMarkdown(message.content) : escapeHtml(message.content).replaceAll("\n", "<br>")}</div>`
    : "";
  return `<article class="agent-message ${message.role}">
    ${message.role === "assistant" ? renderAgentReasoning(message.metadata?.reasoning) : ""}
    ${image}
    ${content}
    ${events.map((event) => renderAgentEvent(event, seenPendingIds)).join("")}
  </article>`;
}

function createStreamingAgentMessage(container) {
  const article = document.createElement("article");
  article.className = "agent-message assistant streaming";
  article.innerHTML = `<details class="agent-reasoning is-thinking hidden">
    <summary>
      <svg class="agent-reasoning-bulb" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6m-5 3h4M8.6 14.8A6.5 6.5 0 1 1 15.4 14.8c-.9.7-1.4 1.6-1.4 2.2h-4c0-.6-.5-1.5-1.4-2.2Z"/></svg>
      <span class="agent-reasoning-label">正在思考…</span>
      <svg class="agent-reasoning-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
    </summary>
    <div></div>
  </details>
  <div class="agent-stream-status">正在思考…</div>
  <div class="agent-message-body agent-markdown hidden"></div>
  <div class="agent-stream-events"></div>`;
  container.append(article);
  const reasoning = article.querySelector(".agent-reasoning");
  const reasoningContent = reasoning.querySelector("div");
  const status = article.querySelector(".agent-stream-status");
  const content = article.querySelector(".agent-message-body");
  const events = article.querySelector(".agent-stream-events");
  let text = "";
  let reasoningText = "";

  function scroll() {
    container.scrollTop = container.scrollHeight;
  }

  return {
    article,
    handle(event) {
      if (event.type === "reasoning_delta") {
        reasoningText += event.delta || "";
        if (reasoning) {
          reasoning.classList.remove("hidden");
          if (reasoningContent) reasoningContent.textContent = reasoningText;
        }
      } else if (event.type === "text_delta") {
        text += event.delta || "";
        if (content) {
          content.classList.remove("hidden");
          content.innerHTML = renderMarkdown(text);
        }
        if (status) status.classList.add("hidden");
      } else if (event.type === "status") {
        if (status) {
          status.textContent = event.label || "正在处理…";
          status.classList.remove("hidden");
        }
      } else if (event.type === "tool_start") {
        if (status) {
          status.textContent = `正在调用工具 · ${event.label || "处理物品"}`;
          status.classList.remove("hidden");
        }
      } else if (event.type === "tool_end") {
        if (status) {
          status.textContent = event.status === "error"
            ? `工具调用失败 · ${event.label || "处理物品"}`
            : event.status === "waiting_confirmation"
              ? `等待确认 · ${event.label || "处理物品"}`
              : `工具调用完成 · ${event.label || "处理物品"}`;
        }
      } else if (event.type === "agent_event") {
        const markup = renderAgentEvent(event.event);
        if (markup && events) events.insertAdjacentHTML("beforeend", markup);
        if (event.event?.pendingAction && status) status.classList.add("hidden");
      } else if (event.type === "done" && event.result?.message) {
        article.outerHTML = renderAgentMessage(event.result.message);
      }
      scroll();
    },
    abort() {
      article.classList.add("agent-message-aborted");
    }
  };
}

async function streamAgentMessage(container, content, options = {}) {
  const streaming = createStreamingAgentMessage(container);
  let result = null;
  const body = { conversationId: state.activeConversationId, content };
  if (options.image) {
    body.image = options.image;
    if (options.imageType) body.imageType = options.imageType;
  }
  await apiStream("/api/agent/messages/stream", {
    method: "POST",
    body: JSON.stringify(body)
  }, (event) => {
    if (event.type === "done") result = event.result;
    streaming.handle(event);
  });
  if (!result) throw new Error("Agent 流式响应意外中断");
  return result;
}

async function loadAgentMessages() {
  if (!state.activeConversationId) return;
  const result = await api(`/api/agent/conversations/${encodeURIComponent(state.activeConversationId)}/messages`);
  const seenPendingIds = new Set();
  $("#agentMessages").innerHTML = result.messages.length
    ? result.messages.map((message) => renderAgentMessage(message, seenPendingIds)).join("")
    : `<div class="agent-empty"><strong>直接说出你想做的事</strong><span>例如：“帮我添加一盒牛奶，7 月 20 日到期。”</span></div>`;
  $("#agentMessages").scrollTop = $("#agentMessages").scrollHeight;
}

async function loadAgent() {
  await loadConversations();
}

async function createConversation() {
  const conversation = await api("/api/agent/conversations", { method: "POST", body: JSON.stringify({ title: "新对话" }) });
  state.activeConversationId = conversation.id;
  await loadConversations();
  return conversation;
}

async function ensureQuickConversation() {
  const latest = state.conversations[0];
  const updatedAt = Date.parse(latest?.updatedAt || "");
  if (latest && Number.isFinite(updatedAt) && Date.now() - updatedAt <= QUICK_CONVERSATION_REUSE_MS) {
    state.activeConversationId = latest.id;
    return latest;
  }
  return createConversation();
}

function quickAgentEmptyMarkup() {
  return `<div class="agent-empty"><strong>按住右下角说话</strong><span>也可以在下方输入文字继续对话。</span></div>`;
}

async function loadQuickAgentMessages() {
  const container = $("#quickAgentMessages");
  if (!state.activeConversationId) {
    container.innerHTML = quickAgentEmptyMarkup();
    return;
  }
  const result = await api(`/api/agent/conversations/${encodeURIComponent(state.activeConversationId)}/messages`);
  const seenPendingIds = new Set();
  container.innerHTML = result.messages.length
    ? result.messages.map((message) => renderAgentMessage(message, seenPendingIds)).join("")
    : quickAgentEmptyMarkup();
  container.scrollTop = container.scrollHeight;
}

function openQuickAgent({ focus = true, loadMessages = true } = {}) {
  if (!state.user || state.view === "agent") return;
  $("#quickAgentDialog").classList.remove("hidden");
  $("#quickAgentFab")?.classList.add("hidden");
  $("#quickAgentVoice")?.classList.add("hidden");
  if (loadMessages) loadQuickAgentMessages().catch((error) => toast(error.message));
  if (focus) {
    const textarea = $("#quickAgentForm").elements.content;
    if (!textarea.disabled) textarea.focus({ preventScroll: true });
  }
}

function closeQuickAgent() {
  $("#quickAgentDialog").classList.add("hidden");
  $("#quickAgentFab")?.classList.remove("hidden");
  $("#quickAgentVoice")?.classList.add("hidden");
}

function displayName(user) {
  return user?.displayName || user?.login || "用户";
}

function roleText(role) {
  return role === "admin" ? "管理员" : "成员";
}

function isAgentAvailable() {
  // The compose box is always usable so the panel is never a dead page.
  // When no model is configured, sending returns a clear guidance message
  // ("Agent 未配置，请填写个人 API Key …") instead of locking the input.
  return true;
}

function renderAccount(user) {
  return `
    <div class="account-line"><span>显示名</span><strong>${escapeHtml(displayName(user))}</strong></div>
    <div class="account-line"><span>邮箱</span><strong>${escapeHtml(user.email || "未设置")}</strong></div>
    <div class="account-line"><span>账号</span><strong>${escapeHtml(user.login)}</strong></div>
    <div class="account-line"><span>Agent 输入额度</span><strong>${escapeHtml(user.agentQuota?.remaining ?? 0)} / ${escapeHtml(user.agentQuota?.limit ?? 0)} 次</strong></div>
    <div class="account-line"><span>注册时间</span><strong>${escapeHtml(formatDate(user.createdAt))}</strong></div>
  `;
}

function renderUser(user) {
  return `<article class="user-card">
    <strong>${escapeHtml(displayName(user))}</strong>
    <small>${escapeHtml(user.email || user.login)}</small>
    <span class="role-pill ${user.role === "admin" ? "admin" : "member"}">${escapeHtml(roleText(user.role))}</span>
    <div class="user-meta">
      <span>${escapeHtml(user.foodCount ?? 0)} 项物品</span>
      <span>${escapeHtml(user.deviceCount ?? 0)} 台设备</span>
      <span>Agent 剩余 ${escapeHtml(user.agentQuota?.remaining ?? 0)} / ${escapeHtml(user.agentQuota?.limit ?? 0)} 次</span>
      <span>${escapeHtml(formatDate(user.createdAt))}</span>
    </div>
    ${state.canManageUsers ? `<form class="quota-form" data-user-quota="${user.id}">
      <label>总额度 <input name="limit" type="number" min="0" max="1000000" step="1" value="${escapeHtml(user.agentQuota?.limit ?? 100)}" required></label>
      <span>已用 ${escapeHtml(user.agentQuota?.used ?? 0)} 次</span>
      <button class="quiet" type="submit">保存额度</button>
    </form>` : ""}
  </article>`;
}

function formatTime(value) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDate(value) {
  if (!value) return "未知";
  return new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function refreshPreview() {
  const panel = $("#previewPanel").value;
  const orientation = $("#previewOrientation").value;
  screenFrame.classList.toggle("portrait", orientation === "portrait");
  screenFrame.classList.toggle("landscape", orientation === "landscape");
  updatePreviewScale();
  window.requestAnimationFrame(updatePreviewScale);
  const isTriColor = panel === "gdey042z98";
  const rowLimit = isTriColor
    ? (orientation === "portrait" ? 7 : 5)
    : (orientation === "portrait" ? 9 : 8);
  $("#previewEyebrow").textContent = isTriColor ? "三色电子纸" : "四色电子纸";
  $("#previewRowLimit").textContent = `${rowLimit} 项`;
  $("#previewRowLabel").textContent = `${orientation === "portrait" ? "竖屏" : "横屏"}展示上限`;
  $("#previewFrameBytes").textContent = isTriColor ? "30 KB" : "96 KB";
  $("#previewFrameLabel").textContent = isTriColor ? "三色双平面协议" : "四色原生帧协议";
  $("#previewDescription").textContent = isTriColor
    ? "已过期和三天内到期都使用红色；临期项目同时保留粗体和下划线，便于区分。内容改变后，设备下次唤醒时刷新画面。"
    : "红色表示已过期，黄色表示三天内到期。内容改变后，设备下次唤醒时刷新画面。";
  screenPreview.src = `/api/display/preview?panel=${encodeURIComponent(panel)}&orientation=${encodeURIComponent(orientation)}&t=${Date.now()}`;
}

function updatePreviewScale() {
  const panel = $("#previewPanel").value;
  const orientation = $("#previewOrientation").value;
  const panelSize = panel === "gdey042z98"
    ? { width: 400, height: 300 }
    : { width: 800, height: 480 };
  const native = orientation === "portrait"
    ? { width: panelSize.height, height: panelSize.width }
    : panelSize;
  const container = screenFrame.parentElement;
  if (!container || container.clientWidth < 50) {
    window.requestAnimationFrame(updatePreviewScale);
    return;
  }
  const containerStyle = getComputedStyle(container);
  const screenStyle = getComputedStyle(screenFrame);
  const containerPaddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
  const screenPaddingX = parseFloat(screenStyle.paddingLeft) + parseFloat(screenStyle.paddingRight);
  const availableWidth = Math.max(1, container.clientWidth - containerPaddingX - screenPaddingX);
  const scale = Math.min(1, availableWidth / native.width);
  screenFrame.style.setProperty("--screen-native-width", `${native.width}px`);
  screenFrame.style.setProperty("--screen-native-height", `${native.height}px`);
  screenFrame.style.setProperty("--screen-scaled-width", `${Math.round(native.width * scale)}px`);
  screenFrame.style.setProperty("--screen-scaled-height", `${Math.round(native.height * scale)}px`);
  screenFrame.style.setProperty("--screen-scale", scale.toFixed(4));
}

function editFood(id, trigger) {
  const item = state.foods.find((food) => food.id === id);
  if (!item) return;
  openFoodEditor(item, trigger);
}

function formPayload(form) {
  const data = new FormData(form);
  return {
    name: data.get("name"),
    category: data.get("category"),
    quantityText: data.get("quantityText"),
    location: data.get("location"),
    expiresOn: expiryMode === "direct" ? data.get("expiresOn") || null : null,
    startDate: expiryMode === "calculated" ? data.get("startDate") || null : null,
    shelfLifeDays: expiryMode === "calculated" ? data.get("shelfLifeDays") || null : null
  };
}

document.addEventListener("click", (event) => {
  const loadMoreActivities = event.target.closest("[data-load-activities]");
  if (loadMoreActivities) {
    loadMoreActivities.disabled = true;
    loadActivities({ append: true }).catch((error) => {
      loadMoreActivities.disabled = false;
      toast(error.message);
    });
    return;
  }
  const fullscreen = event.target.closest("#displayFullscreen");
  if (fullscreen) {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => toast("当前浏览器无法进入全屏"));
    return;
  }
  const newFood = event.target.closest("[data-new-food]");
  if (newFood) {
    if (state.foodList.filter !== "all") {
      state.foodList.filter = "all";
      renderFoodList();
    }
    openFoodEditor(null, newFood);
    return;
  }
  const link = event.target.closest("[data-view-target]");
  if (!link) return;
  if (link.dataset.displayExit !== undefined && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  setView(link.dataset.viewTarget);
  if (link.dataset.deviceSection === "preview") {
    window.requestAnimationFrame(() => $("#devicePreviewSection").scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  if (link.dataset.scrollTo) {
    const target = $(link.dataset.scrollTo);
    if (target) window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
});

document.addEventListener("fullscreenchange", () => {
  syncFullscreenButton();
});

document.addEventListener("visibilitychange", () => {
  if (state.view === "display" && document.visibilityState === "visible") requestDisplayWakeLock();
});

window.addEventListener("hashchange", () => {
  if (state.user) setView(location.hash.slice(1), { updateHash: false });
});

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = new FormData(event.target);
    const user = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ login: data.get("login"), password: data.get("password") })
    });
    await enterWorkspace(user);
  } catch (error) {
    toast(error.message);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = new FormData(event.target);
    const body = {
      email: data.get("email"),
      displayName: data.get("displayName"),
      password: data.get("password")
    };
    const invitationCode = data.get("invitationCode");
    if (invitationCode) body.invitationCode = String(invitationCode).trim().toUpperCase();
    const user = await api("/api/auth/register", { method: "POST", body: JSON.stringify(body) });
    state.pendingInviteCode = "";
    event.target.reset();
    await enterWorkspace(user);
    toast(user.joinedHousehold ? `已加入「${user.joinedHousehold.name}」` : "账号已创建");
  } catch (error) {
    toast(error.message);
  }
});

const _el_logout = $("#logout");
if (_el_logout) $("#logout").addEventListener("click", async () => {
  state.user = null; // 先清登录态，避免 hashchange 触发未授权加载
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  location.hash = "";
  location.reload();
});

foodForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateFoodForm()) return;
  const editing = Boolean(state.editingId);
  if (foodEditor.save) foodEditor.save.disabled = true;
  try {
    const url = state.editingId ? `/api/foods/${state.editingId}` : "/api/foods";
    await api(url, { method: state.editingId ? "PATCH" : "POST", body: JSON.stringify(formPayload(foodForm)) });
    await Promise.all([loadFoods(), loadActivities()]);
    await requestFoodEditorClose({ force: true });
    toast(editing ? "物品信息已更新" : "物品已添加");
  } catch (error) {
    toast(`保存失败：${error.message}`);
  } finally {
    if (foodEditor.save) foodEditor.save.disabled = false;
  }
});

foodEditor.close.addEventListener("click", () => requestFoodEditorClose());
foodEditor.cancel.addEventListener("click", () => requestFoodEditorClose());
foodEditor.overlay.addEventListener("click", (event) => {
  if (event.target === foodEditor.overlay) requestFoodEditorClose();
});
const _el_categoryTrigger = $("#categoryTrigger");
if (_el_categoryTrigger) $("#categoryTrigger").addEventListener("click", toggleCategoryPicker);
const _el_categoryPicker = $("#categoryPicker");
if (_el_categoryPicker) $("#categoryPicker").addEventListener("click", (event) => {
  const option = event.target.closest("[data-category]");
  if (!option) return;
  setCategory(option.dataset.category);
  closeCategoryPicker();
  $("#categoryTrigger").focus({ preventScroll: true });
});
document.querySelectorAll("[data-expiry-mode]").forEach((button) => {
  button.addEventListener("click", () => setExpiryMode(button.dataset.expiryMode));
});
document.querySelectorAll("[data-date-offset]").forEach((button) => {
  button.addEventListener("click", () => {
    setDateValue("expiresOn", offsetDateKey(currentDateKey(), Number(button.dataset.dateOffset)));
    closeCalendar();
  });
});
document.querySelectorAll("[data-shelf-life]").forEach((button) => {
  button.addEventListener("click", () => {
    foodForm.elements.shelfLifeDays.value = button.dataset.shelfLife;
    clearFieldError("shelfLifeDays");
    updateShelfLifePresets();
    updateCalculatedExpiry();
  });
});
document.querySelectorAll("[data-date-target]").forEach((button) => {
  button.addEventListener("click", () => {
    if (activeCalendarTarget === button.dataset.dateTarget && !$("#foodCalendar").classList.contains("hidden")) closeCalendar();
    else openCalendar(button.dataset.dateTarget);
  });
});
const _el_calendarPrevious = $("#calendarPrevious");
if (_el_calendarPrevious) $("#calendarPrevious").addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1, 12);
  renderCalendar();
});
const _el_calendarNext = $("#calendarNext");
if (_el_calendarNext) $("#calendarNext").addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1, 12);
  renderCalendar();
});
const _el_calendarGrid = $("#calendarGrid");
if (_el_calendarGrid) $("#calendarGrid").addEventListener("click", (event) => {
  const day = event.target.closest("[data-calendar-date]");
  if (!day || !activeCalendarTarget) return;
  setDateValue(activeCalendarTarget, day.dataset.calendarDate);
  closeCalendar();
});
foodForm.elements.name.addEventListener("input", () => clearFieldError("name"));
foodForm.elements.shelfLifeDays.addEventListener("input", () => {
  clearFieldError("shelfLifeDays");
  updateShelfLifePresets();
  updateCalculatedExpiry();
});
const refreshPreviewBtn = $("#refreshPreview");
if (refreshPreviewBtn) refreshPreviewBtn.addEventListener("click", refreshPreview);
const previewOrientation = $("#previewOrientation");
if (previewOrientation) previewOrientation.addEventListener("change", refreshPreview);
const previewPanelSelect = $("#previewPanel");
if (previewPanelSelect) previewPanelSelect.addEventListener("change", refreshPreview);
window.addEventListener("resize", () => {
  if (state.view === "devices") updatePreviewScale();
});
if ("ResizeObserver" in window && screenFrame) {
  new ResizeObserver(() => {
    if (state.view === "devices") updatePreviewScale();
  }).observe(screenFrame);
}

const _el_foods = $("#foods");
if (_el_foods) $("#foods").addEventListener("click", async (event) => {
  const expand = event.target.closest("[data-food-expand]");
  if (expand) {
    const id = Number(expand.dataset.foodExpand);
    state.foodList.expandedId = state.foodList.expandedId === id ? null : id;
    renderFoodList();
    return;
  }
  const eat = event.target.closest("[data-item-eat]");
  if (eat) { handleItemAction(Number(eat.dataset.itemEat), "eat"); return; }
  const cook = event.target.closest("[data-item-cook]");
  if (cook) { handleItemAction(Number(cook.dataset.itemCook), "cook"); return; }
  const discard = event.target.closest("[data-item-discard]");
  if (discard) { handleItemAction(Number(discard.dataset.itemDiscard), "discard"); return; }
  const restore = event.target.closest("[data-item-restore]");
  if (restore) { restoreItem(Number(restore.dataset.itemRestore)); return; }
  const edit = event.target.closest("[data-edit]");
  if (edit) {
    editFood(Number(edit.dataset.edit), edit);
    return;
  }
  const remove = event.target.closest("[data-delete]");
  if (remove) {
    await deleteFood(Number(remove.dataset.delete), "删除");
  }
});

async function handleItemAction(id, action) {
  const item = state.foods.find((food) => food.id === id);
  if (!item || item.status === "handled") return;
  const labels = { eat: "吃掉", cook: "做菜", discard: "丢弃" };
  const label = labels[action] || "处理";
  // 乐观更新：先标记已处理，给出即时反馈；随后落库，失败则回滚。
  const previousStatus = item.status;
  item.status = "handled";
  item.handled = true;
  item.handledAction = action;
  toast(`${item.name} 已${label}`);
  renderFoodList();
  try {
    await api(`/api/foods/${id}/handle`, { method: "POST", body: JSON.stringify({ action }) });
    await Promise.all([loadFoods(), loadActivities()]);
  } catch (error) {
    item.status = previousStatus;
    item.handled = false;
    item.handledAction = null;
    renderFoodList();
    toast(error.message || `${item.name} 处理失败，已撤销`);
  }
}

async function restoreItem(id) {
  const item = state.foods.find((food) => food.id === id);
  if (!item || item.status !== "handled") return;
  const prevLabel = { eat: "吃掉", cook: "做菜", discard: "丢弃" }[item.handledAction] || "已处理";
  const previousAction = item.handledAction;
  const days = item.daysRemaining;
  item.status = days < 0 ? "expired" : days <= 3 ? "expiring" : "fresh";
  item.handled = false;
  item.handledAction = null;
  toast(`${item.name} 已恢复（${prevLabel}）`);
  renderFoodList();
  try {
    await api(`/api/foods/${id}/restore`, { method: "POST" });
    await Promise.all([loadFoods(), loadActivities()]);
  } catch (error) {
    item.status = "handled";
    item.handled = true;
    item.handledAction = previousAction;
    renderFoodList();
    toast(error.message || `${item.name} 恢复失败`);
  }
}

async function deleteFood(id, label) {
  const item = state.foods.find((food) => food.id === id);
  const confirmed = await confirmDialog({
    eyebrow: `${label}物品`,
    title: `确定${label}该物品吗？`,
    body: item
      ? `${item.name} 将从家庭记录中移除，墨水屏下次刷新时也会同步更新。`
      : "删除后将无法在列表中继续显示。",
    confirmText: label,
    tone: "danger"
  });
  if (!confirmed) return;
  try {
    await api(`/api/foods/${id}`, { method: "DELETE" });
    await Promise.all([loadFoods(), loadActivities()]);
    toast(item ? `${item.name} 已${label}` : "物品已删除");
  } catch (error) {
    toast(error.message);
  }
}

const _el_displayFoods = $("#displayFoods");
if (_el_displayFoods) $("#displayFoods").addEventListener("click", async (event) => {
  const handle = event.target.closest("[data-display-handle]");
  if (!handle) return;

  const item = state.foods.find((food) => food.id === Number(handle.dataset.displayHandle));
  const confirmed = await confirmDialog({
    eyebrow: "快速处理",
    title: item ? `确认已处理“${item.name}”？` : "确认已处理该物品？",
    body: "确认后将标记为已处理，可在食材台账的“已处理”标签中查看。",
    confirmText: "确认处理",
    tone: "danger"
  });
  if (!confirmed) return;

  try {
    await api(`/api/foods/${handle.dataset.displayHandle}/handle`, { method: "POST", body: JSON.stringify({ action: "eat" }) });
    await Promise.all([loadFoods(), loadActivities()]);
    toast(item ? `${item.name} 已处理` : "物品已处理");
  } catch (error) {
    toast(error.message);
  }
});

// _el_foods = $("#foods");
if (_el_foods) $("#foods").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-food-select]");
  if (!checkbox) return;
  const id = Number(checkbox.dataset.foodSelect);
  if (checkbox.checked) state.foodList.selectedIds.add(id);
  else state.foodList.selectedIds.delete(id);
  renderFoodList();
});

document.querySelectorAll(".food-filter-trigger").forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFoodListMenu(trigger.closest("[data-food-menu]").dataset.foodMenu);
  });
});

const _el_foodSearch = $("#foodSearch");
if (_el_foodSearch) $("#foodSearch").addEventListener("input", (event) => {
  state.foodList.query = event.target.value;
  state.foodList.expandedId = null;
  renderFoodList();
});

const _el_foodLocationFilter = $("#foodLocationFilter");
if (_el_foodLocationFilter) $("#foodLocationFilter").addEventListener("change", (event) => {
  state.foodList.location = event.target.value;
  state.foodList.expandedId = null;
  renderFoodList();
});

$(".food-list-tools").addEventListener("click", (event) => {
  const option = event.target.closest("[data-food-list-value]");
  if (!option) return;
  event.stopPropagation();
  const type = option.dataset.foodListType;
  if (type === "status") state.foodList.filter = option.dataset.foodListValue;
  if (type === "sort") state.foodList.sort = option.dataset.foodListValue;
  state.foodList.expandedId = null;
  closeFoodListMenus();
  renderFoodList();
  $(`[data-food-menu="${type}"] .food-filter-trigger`).focus({ preventScroll: true });
});

$(".food-list-tools").addEventListener("keydown", (event) => {
  const option = event.target.closest("[data-food-list-value]");
  if (event.key === "Escape") {
    closeFoodListMenus({ restoreFocus: true });
    return;
  }
  if (!option || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const options = [...option.closest(".food-filter-menu").querySelectorAll("[data-food-list-value]")];
  const index = options.indexOf(option);
  const target = event.key === "Home" ? options[0]
    : event.key === "End" ? options.at(-1)
      : options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length];
  target.focus({ preventScroll: true });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".food-list-menu")) closeFoodListMenus();
});

const _el_foodManageToggle = $("#foodManageToggle");
if (_el_foodManageToggle) $("#foodManageToggle").addEventListener("click", () => setFoodManagement(!state.foodList.managing));
document.querySelectorAll(".food-status-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const filter = tab.dataset.foodFilter;
    if (filter && filter !== state.foodList.filter) {
      state.foodList.filter = filter;
      renderFoodList();
    }
  });
});
const _el_foodBatchDate = $("#foodBatchDate");
if (_el_foodBatchDate) $("#foodBatchDate").addEventListener("click", openBatchFoodDate);
const _el_foodBatchDelete = $("#foodBatchDelete");
if (_el_foodBatchDelete) $("#foodBatchDelete").addEventListener("click", async () => {
  try {
    await deleteSelectedFoods();
  } catch (error) {
    toast(error.message);
  }
});
if (batchFoodDate.cancel) batchFoodDate.cancel.addEventListener("click", closeBatchFoodDate);
if (batchFoodDate.save) batchFoodDate.save.addEventListener("click", updateSelectedFoodExpiry);
if (batchFoodDate.overlay) batchFoodDate.overlay.addEventListener("click", (event) => {
  if (event.target === batchFoodDate.overlay) closeBatchFoodDate();
});

const _el_createHouseholdInvite = $("#createHouseholdInvite");
if (_el_createHouseholdInvite) $("#createHouseholdInvite").addEventListener("click", async () => {
  try {
    const result = await api("/api/household/invites", { method: "POST", body: "{}" });
    state.householdInvite = result;
    $("#householdInviteCode").textContent = result.code;
    $("#householdInviteExpires").textContent = `有效期至 ${formatTime(result.expiresAt)}，使用一次后失效`;
    $("#householdInvitePanel").classList.remove("hidden");
    toast("家庭邀请已生成");
  } catch (error) {
    toast(error.message);
  }
});

async function copyToClipboard(text) {
  if (!text) return false;
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    return true;
  } finally {
    document.body.removeChild(textarea);
  }
}

const _el_copyHouseholdInviteCode = $("#copyHouseholdInviteCode");
if (_el_copyHouseholdInviteCode) $("#copyHouseholdInviteCode").addEventListener("click", async () => {
  if (!state.householdInvite?.code) return;
  const ok = await copyToClipboard(state.householdInvite.code);
  toast(ok ? "邀请码已复制" : `复制失败，请手动复制：${state.householdInvite.code}`);
});

const _el_copyHouseholdInvite = $("#copyHouseholdInvite");
if (_el_copyHouseholdInvite) $("#copyHouseholdInvite").addEventListener("click", async () => {
  if (!state.householdInvite?.inviteUrl) return;
  const ok = await copyToClipboard(state.householdInvite.inviteUrl);
  toast(ok ? "注册链接已复制" : `复制失败，请分享邀请码 ${state.householdInvite.code}`);
});

const _el_householdMembers = $("#householdMembers");
if (_el_householdMembers) $("#householdMembers").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-household-member]");
  if (!button) return;
  const member = state.household?.members.find((item) => item.id === Number(button.dataset.removeHouseholdMember));
  const confirmed = await confirmDialog({
    eyebrow: "家庭成员",
    title: `移除“${member?.displayName || "该成员"}”？`,
    body: "移除后，对方将立即失去这个家庭的物品、设备和屏幕访问权限，并获得一个新的空家庭。",
    confirmText: "移除",
    tone: "danger"
  });
  if (!confirmed) return;
  try {
    await api(`/api/household/members/${button.dataset.removeHouseholdMember}`, { method: "DELETE" });
    await Promise.all([loadHousehold(), loadActivities()]);
    toast("家庭成员已移除");
  } catch (error) {
    toast(error.message);
  }
});

const _el_leaveHousehold = $("#leaveHousehold");
if (_el_leaveHousehold) $("#leaveHousehold").addEventListener("click", async () => {
  const confirmed = await confirmDialog({
    eyebrow: "退出家庭",
    title: `退出“${state.household?.household.name || "当前家庭"}”？`,
    body: "退出后你将无法访问当前家庭的物品、设备和屏幕内容，系统会为你创建一个新的空家庭。",
    confirmText: "退出",
    tone: "danger"
  });
  if (!confirmed) return;
  try {
    await api("/api/household/leave", { method: "POST", body: "{}" });
    state.user = null;
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    location.href = "/";
  } catch (error) {
    toast(error.message);
  }
});

const _el_tokenForm = $("#tokenForm");
if (_el_tokenForm) $("#tokenForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.target.querySelector("button");
  button.disabled = true;
  try {
    const data = new FormData(event.target);
    const result = await api("/api/access-tokens", { method: "POST", body: JSON.stringify({ name: data.get("name") }) });
    $("#newTokenValue").textContent = result.token;
    $("#agentSetupPrompt").textContent = agentSetupPrompt(result.token);
    $("#newTokenPanel").classList.remove("hidden");
    event.target.reset();
    await loadTokens();
    toast("访问令牌已生成");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

const _el_aiSettingsForm = $("#aiSettingsForm");
if (_el_aiSettingsForm) $("#aiSettingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const data = new FormData(event.target);
    await api("/api/agent/settings", {
      method: "PUT",
      body: JSON.stringify({
        openaiApiKey: data.get("openaiApiKey"),
        openaiModel: data.get("openaiModel"),
        openaiBaseUrl: data.get("openaiBaseUrl")
      })
    });
    await Promise.all([loadAiSettings(), loadConversations()]);
    toast("个人模型配置已保存");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

const _el_useDeepSeekPreset = $("#useDeepSeekPreset");
if (_el_useDeepSeekPreset) $("#useDeepSeekPreset").addEventListener("click", () => {
  const form = $("#aiSettingsForm");
  form.elements.openaiModel.value = "deepseek-v4-flash";
  form.elements.openaiBaseUrl.value = "https://api.deepseek.com";
  form.elements.openaiApiKey.focus();
  toast("已填入 DeepSeek 参数，请粘贴 API Key");
});

const _el_clearAiSettings = $("#clearAiSettings");
if (_el_clearAiSettings) $("#clearAiSettings").addEventListener("click", async () => {
  const confirmed = await confirmDialog({
    title: "改用系统 Agent？",
    body: "你的个人 API Key 和模型配置会被清除；历史对话不会删除。之后将使用系统 Agent 和个人系统额度。",
    confirmText: "改用系统配置"
  });
  if (!confirmed) return;
  try {
    await api("/api/agent/settings", { method: "DELETE" });
    await Promise.all([loadAiSettings(), loadConversations()]);
    toast("已改用系统 Agent");
  } catch (error) {
    toast(error.message);
  }
});

const _el_systemAiSettingsForm = $("#systemAiSettingsForm");
if (_el_systemAiSettingsForm) $("#systemAiSettingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const data = new FormData(event.target);
    await api("/api/admin/agent/settings", {
      method: "PUT",
      body: JSON.stringify({
        openaiApiKey: data.get("openaiApiKey"),
        openaiModel: data.get("openaiModel"),
        openaiBaseUrl: data.get("openaiBaseUrl")
      })
    });
    await Promise.all([loadAiSettings(), loadConversations()]);
    toast("系统 Agent 配置已保存");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

const _el_clearSystemAiSettings = $("#clearSystemAiSettings");
if (_el_clearSystemAiSettings) $("#clearSystemAiSettings").addEventListener("click", async () => {
  const confirmed = await confirmDialog({
    title: "清除系统 Agent？",
    body: "清除后，未设置个人 API Key 的用户将无法使用 Agent；个人配置和历史对话不会删除。",
    confirmText: "清除系统配置",
    tone: "danger"
  });
  if (!confirmed) return;
  try {
    await api("/api/admin/agent/settings", { method: "DELETE" });
    await Promise.all([loadAiSettings(), loadConversations()]);
    toast("系统 Agent 配置已清除");
  } catch (error) {
    toast(error.message);
  }
});

const _el_users = $("#users");
if (_el_users) $("#users").addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-user-quota]");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const data = new FormData(form);
    await api(`/api/users/${encodeURIComponent(form.dataset.userQuota)}/agent-quota`, {
      method: "PATCH",
      body: JSON.stringify({ limit: Number(data.get("limit")) })
    });
    await Promise.all([loadUsers(), loadConversations()]);
    toast("Agent 额度已更新");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

const _el_copyToken = $("#copyToken");
if (_el_copyToken) $("#copyToken").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#newTokenValue").textContent);
    toast("令牌已复制");
  } catch {
    toast("复制失败，请手动选择令牌");
  }
});

const _el_copyAgentSetup = $("#copyAgentSetup");
if (_el_copyAgentSetup) $("#copyAgentSetup").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#agentSetupPrompt").textContent);
    toast("Agent 配置指令已复制");
  } catch {
    toast("复制失败，请手动选择配置指令");
  }
});

const _el_accessTokens = $("#accessTokens");
if (_el_accessTokens) $("#accessTokens").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-revoke-token]");
  if (!button) return;
  const confirmed = await confirmDialog({ title: "撤销访问令牌？", body: "使用该令牌的 Agent 将立即无法访问物品。", confirmText: "撤销", tone: "danger" });
  if (!confirmed) return;
  try {
    await api(`/api/access-tokens/${button.dataset.revokeToken}`, { method: "DELETE" });
    await loadTokens();
    toast("令牌已撤销");
  } catch (error) {
    toast(error.message);
  }
});

const _el_newConversation = $("#newConversation");
if (_el_newConversation) $("#newConversation").addEventListener("click", () => {
  setConversationListOpen(false);
  createConversation().catch((error) => toast(error.message));
});

const _el_conversationToggle = $("#conversationToggle");
if (_el_conversationToggle) $("#conversationToggle").addEventListener("click", () => {
  setConversationListOpen($("#conversationToggle").getAttribute("aria-expanded") !== "true");
});

const _el_conversations = $("#conversations");
if (_el_conversations) $("#conversations").addEventListener("click", async (event) => {
  const remove = event.target.closest("[data-delete-conversation]");
  if (remove) {
    const conversation = state.conversations.find((item) => item.id === remove.dataset.deleteConversation);
    const confirmed = await confirmDialog({
      eyebrow: "删除历史对话",
      title: `删除“${conversation?.title || "这段对话"}”？`,
      body: "对话消息和未完成的确认操作都会一并删除，且无法恢复。",
      confirmText: "删除",
      tone: "danger"
    });
    if (!confirmed) return;
    try {
      await api(`/api/agent/conversations/${encodeURIComponent(remove.dataset.deleteConversation)}`, { method: "DELETE" });
      if (state.activeConversationId === remove.dataset.deleteConversation) state.activeConversationId = null;
      await loadConversations();
      setConversationListOpen(false);
      toast("对话已删除");
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  const button = event.target.closest("[data-conversation]");
  if (!button) return;
  state.activeConversationId = button.dataset.conversation;
  renderConversations();
  setConversationListOpen(false);
  await loadAgentMessages();
});

const _el_agentMessages = $("#agentMessages");
if (_el_agentMessages) $("#agentMessages").addEventListener("click", () => setConversationListOpen(false));
window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 640px)").matches) setConversationListOpen(false);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || state.view !== "display") return;
  refreshPresentationFoods();
  requestDisplayWakeLock();
});
window.addEventListener("online", () => refreshPresentationFoods());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setConversationListOpen(false);
    closeQuickAgent();
  }
});

const _el_agentForm = $("#agentForm");
if (_el_agentForm) $("#agentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const textarea = event.target.elements.content;
  const content = textarea.value.trim();
  if (!content) return;
  if (!state.activeConversationId) await createConversation();
  const button = event.target.querySelector('[type="submit"]');
  const voiceButton = event.target.querySelector("[data-voice-input]");
  textarea.disabled = true;
  button.disabled = true;
  if (voiceButton) updateVoiceButtonAvailability(event.target);
  textarea.value = "";
  resizeAgentTextarea(textarea);
  $("#agentMessages").insertAdjacentHTML("beforeend", renderAgentMessage({ role: "user", content, metadata: null }));
  $("#agentMessages").scrollTop = $("#agentMessages").scrollHeight;
  try {
    await streamAgentMessage($("#agentMessages"), content);
    await Promise.all([loadConversations(), loadFoods(), loadActivities()]);
  } catch (error) {
    $("#agentMessages .agent-message.streaming:last-of-type")?.remove();
    textarea.value = content;
    resizeAgentTextarea(textarea);
    toast(`发送失败，输入内容已保留：${agentSendErrorMessage(error)}`);
  } finally {
    textarea.disabled = !isAgentAvailable();
    button.disabled = !isAgentAvailable();
    if (voiceButton) updateVoiceButtonAvailability(event.target);
    textarea.focus();
  }
});

const _el_quickAgentForm = $("#quickAgentForm");
if (_el_quickAgentForm) $("#quickAgentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const textarea = event.target.elements.content;
  const content = textarea.value.trim();
  if (!content) return;
  openQuickAgent({ focus: false, loadMessages: false });
  const messages = $("#quickAgentMessages");
  messages.querySelector(".agent-empty")?.remove();
  messages.querySelector(".agent-message.streaming")?.remove();
  messages.insertAdjacentHTML("beforeend", renderAgentMessage({ role: "user", content, metadata: null }));
  messages.scrollTop = messages.scrollHeight;
  await ensureQuickConversation();
  const button = event.target.querySelector('[type="submit"]');
  const voiceButton = event.target.querySelector("[data-voice-input]");
  textarea.disabled = true;
  button.disabled = true;
  if (voiceButton) updateVoiceButtonAvailability(event.target);
  try {
    await streamAgentMessage(messages, content);
    textarea.value = "";
    resizeAgentTextarea(textarea);
    await Promise.all([loadConversations(), loadFoods(), loadActivities()]);
    await loadQuickAgentMessages();
  } catch (error) {
    messages.querySelector(".agent-message.streaming")?.remove();
    textarea.value = content;
    resizeAgentTextarea(textarea);
    const errorMessage = agentSendErrorMessage(error);
    messages.insertAdjacentHTML("beforeend", `<div class="agent-quick-error">发送失败，输入内容已保留：${escapeHtml(errorMessage)}</div>`);
    messages.scrollTop = messages.scrollHeight;
    toast(`发送失败，输入内容已保留：${errorMessage}`);
  } finally {
    textarea.disabled = !isAgentAvailable();
    button.disabled = !isAgentAvailable();
    if (voiceButton) updateVoiceButtonAvailability(event.target);
    if (!$("#quickAgentDialog").classList.contains("hidden") && !textarea.disabled) textarea.focus();
  }
});

const _el_quickAgentClose = $("#quickAgentClose");
if (_el_quickAgentClose) $("#quickAgentClose").addEventListener("click", closeQuickAgent);
const _el_quickAgentOpenFull = $("#quickAgentOpenFull");
if (_el_quickAgentOpenFull) $("#quickAgentOpenFull").addEventListener("click", () => setView("agent"));
document.querySelector(".overview-agent-shortcuts").addEventListener("click", (event) => {
  const shortcut = event.target.closest("[data-quick-agent-prompt]");
  if (!shortcut || shortcut.disabled) return;
  const form = $("#quickAgentForm");
  const textarea = form.elements.content;
  textarea.value = shortcut.dataset.quickAgentPrompt;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  form.requestSubmit();
});
document.querySelector(".account-section-nav")?.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-scroll-to]");
  if (!btn) return;
  const el = $(btn.dataset.scrollTo);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* 小食 AI 弹窗内快捷入口：拍照识食材 / 今日菜谱 / 临期预警 / AI 膳养 */
const _el_quickShortcuts = $(".quick-agent-shortcuts");
if (_el_quickShortcuts) _el_quickShortcuts.addEventListener("click", (event) => {
  const shortcut = event.target.closest("[data-quick-shortcut]");
  if (!shortcut || shortcut.disabled) return;
  handleQuickShortcut(shortcut);
});

function handleQuickShortcut(shortcut) {
  const kind = shortcut.dataset.quickShortcut;
  const form = $("#quickAgentForm");
  const textarea = form.elements.content;
  if (kind === "拍照识食材") {
    triggerCameraCapture();
    return;
  }
  const prompts = {
    "今日菜谱": "帮我推荐几道今日菜谱",
    "临期预警": "有哪些食材快过期了，请给我临期预警",
    "AI 膳养": "根据我现有的食材，给我一些膳养建议"
  };
  textarea.value = prompts[kind] || kind;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  form.requestSubmit();
}

/* 调起相机/相册，读取为 base64 后作为用户消息发送到小食助手 */
function triggerCameraCapture() {
  if (!window.isSecureContext) {
    toast("调用相机需要 HTTPS 安全环境，请通过安全地址打开页面");
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.capture = "environment";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    document.body.removeChild(input);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const base64 = String(reader.result || "");
      if (!base64) { toast("读取图片失败，请重试"); return; }
      sendFoodPhotoToAgent(file, base64).catch((error) => toast(agentSendErrorMessage(error)));
    }, { once: true });
    reader.addEventListener("error", () => toast("读取图片失败，请重试"), { once: true });
    reader.readAsDataURL(file);
  });
  input.click();
}

async function sendFoodPhotoToAgent(file, base64) {
  const form = $("#quickAgentForm");
  const textarea = form.elements.content;
  const content = "请识别这张图片里的食材";
  openQuickAgent({ focus: false, loadMessages: false });
  const messages = $("#quickAgentMessages");
  messages.querySelector(".agent-empty")?.remove();
  messages.querySelector(".agent-message.streaming")?.remove();
  messages.insertAdjacentHTML("beforeend", renderAgentMessage({ role: "user", content, metadata: { image: base64 } }));
  messages.scrollTop = messages.scrollHeight;
  await ensureQuickConversation();
  const button = form.querySelector('[type="submit"]');
  const voiceButton = form.querySelector("[data-voice-input]");
  textarea.disabled = true;
  button.disabled = true;
  if (voiceButton) updateVoiceButtonAvailability(form);
  try {
    await streamAgentMessage(messages, content, { image: base64, imageType: file.type });
    textarea.value = "";
    resizeAgentTextarea(textarea);
    await Promise.all([loadConversations(), loadFoods(), loadActivities()]);
    await loadQuickAgentMessages();
  } catch (error) {
    messages.querySelector(".agent-message.streaming")?.remove();
    const errorMessage = agentSendErrorMessage(error);
    messages.insertAdjacentHTML("beforeend", `<div class="agent-quick-error">发送失败：${escapeHtml(errorMessage)}</div>`);
    messages.scrollTop = messages.scrollHeight;
    toast(`发送失败：${errorMessage}`);
  } finally {
    textarea.disabled = !isAgentAvailable();
    button.disabled = !isAgentAvailable();
    if (voiceButton) updateVoiceButtonAvailability(form);
  }
}

async function handleAgentActionClick(event) {
  const confirm = event.target.closest("[data-agent-confirm]");
  const cancel = event.target.closest("[data-agent-cancel]");
  if (!confirm && !cancel) return;
  const card = (confirm || cancel).closest(".pending-action");
  if (card?.dataset.processing === "true") return;
  const id = confirm?.dataset.agentConfirm || cancel.dataset.agentCancel;
  const buttons = card ? [...card.querySelectorAll("button")] : [confirm || cancel];
  const actionButton = confirm || cancel;
  const originalLabel = actionButton.textContent;
  if (card) {
    card.dataset.processing = "true";
    card.setAttribute("aria-busy", "true");
  }
  buttons.forEach((button) => { button.disabled = true; });
  actionButton.textContent = confirm ? "正在执行并生成回复…" : "正在取消…";
  try {
    const result = await api(`/api/agent/actions/${encodeURIComponent(id)}/${confirm ? "confirm" : "cancel"}`, { method: "POST", body: "{}" });
    await Promise.all([loadAgentMessages(), loadQuickAgentMessages(), loadFoods(), loadActivities()]);
    if (state.view === "devices") refreshPreview();
    const completedText = result.alreadyResolved
      ? (result.resolution === "confirmed" ? "操作已经执行，无需重复确认" : "操作已经取消")
      : (confirm ? "操作已确认执行" : "操作已取消");
    toast(completedText);
  } catch (error) {
    if (card) {
      delete card.dataset.processing;
      card.removeAttribute("aria-busy");
    }
    buttons.forEach((button) => { button.disabled = false; });
    actionButton.textContent = originalLabel;
    toast(error.message);
  }
}

// _el_agentMessages = $("#agentMessages");
if (_el_agentMessages) $("#agentMessages").addEventListener("click", handleAgentActionClick);
const _el_quickAgentMessages = $("#quickAgentMessages");
if (_el_quickAgentMessages) $("#quickAgentMessages").addEventListener("click", handleAgentActionClick);

function enableEnterToSubmit(form) {
  const textarea = form.querySelector("textarea");
  textarea.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    if (!textarea.disabled && !submitButton.disabled) form.requestSubmit();
  });
}

function resizeAgentTextarea(textarea) {
  textarea.style.height = "40px";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
}

function agentSendErrorMessage(error) {
  if (error?.message === "Connection error.") return "无法连接家庭 Agent 模型，请检查用户页面里的模型配置";
  return error?.message || "发送给助手失败，请稍后重试";
}

function enableAgentTextareaAutoGrow(form) {
  const textarea = form.querySelector("textarea");
  textarea.addEventListener("input", () => resizeAgentTextarea(textarea));
  resizeAgentTextarea(textarea);
}

function setAgentFormAvailability(form, available) {
  const compose = form.matches(".agent-compose") ? form : form.querySelector("[data-agent-compose]");
  compose?.classList.toggle("agent-disabled", !available);
  form.querySelector("textarea").disabled = !available;
  form.querySelector('[type="submit"]').disabled = !available;
  if (!available) voiceControllers.get(form)?.abort();
  updateVoiceButtonAvailability(form);
}

function updateVoiceButtonAvailability(form) {
  const button = form.querySelector("[data-voice-input]");
  const modeToggle = form.querySelector("[data-input-mode-toggle]");
  if (!button) return;
  const controller = voiceControllers.get(form);
  const processing = controller?.isProcessing() === true;
  const formUnavailable = form.querySelector("textarea")?.disabled === true;
  const browserSpeech = getBrowserSpeechRecognition();
  const asrAvailable = state.voiceConfigured === true || Boolean(browserSpeech);
  const voiceUnavailable = !controller || formUnavailable || !state.agentConfigured || !asrAvailable || processing;
  const supportsTextFallback = button.hasAttribute("data-text-fallback");
  controller?.setVoiceAvailable(!voiceUnavailable);
  const keepEnabled = controller?.keepButtonEnabled === true;
  // 对于弹窗内的麦克风按钮，即使语音不可用也保持可点击，点击时给出明确提示（toast）
  button.disabled = supportsTextFallback ? processing : (keepEnabled ? (processing || formUnavailable) : voiceUnavailable);
  if (modeToggle) modeToggle.disabled = voiceUnavailable;
  const voiceHint = !asrAvailable
    ? "系统语音识别尚未配置"
    : state.voiceConfigured !== true && browserSpeech
      ? "使用浏览器语音识别，按住说话，松开发送"
      : formUnavailable || !state.agentConfigured
        ? "助手当前不可用"
        : "按住说话，松开发送";
  button.title = supportsTextFallback && voiceUnavailable ? `${voiceHint}；轻点打开文字对话` : voiceHint;
}

function initializeVoiceRecordingWave() {
  if (!voiceRecordingWave || voiceRecordingWave.childElementCount) return;
  const bars = Array.from({ length: 38 }, (_, index) => {
    const bar = document.createElement("span");
    bar.style.setProperty("--voice-bar-height", `${10 + ((index * 13) % 25)}px`);
    return bar;
  });
  voiceRecordingWave.replaceChildren(...bars);
}

function showVoiceRecordingOverlay(owner, { preparing = false } = {}) {
  if (!voiceRecordingOverlay) return;
  voiceRecordingOverlayOwner = owner;
  voiceRecordingOverlay.classList.remove("hidden", "is-cancelling");
  voiceRecordingOverlay.setAttribute("aria-hidden", "false");
  voiceRecordingTitle.textContent = preparing ? "正在准备麦克风…" : "正在收音…";
  voiceRecordingHint.textContent = "松手发送，上移取消";
  document.body.classList.add("voice-recording-open");
}

function setVoiceRecordingCancelState(owner, cancelling) {
  if (!voiceRecordingOverlay || voiceRecordingOverlayOwner !== owner) return;
  voiceRecordingOverlay.classList.toggle("is-cancelling", cancelling);
  voiceRecordingTitle.textContent = cancelling ? "松手取消" : "正在收音…";
  voiceRecordingHint.textContent = cancelling ? "下移可继续录音" : "松手发送，上移取消";
}

function hideVoiceRecordingOverlay(owner) {
  if (!voiceRecordingOverlay || (owner && voiceRecordingOverlayOwner !== owner)) return;
  voiceRecordingOverlay.classList.add("hidden");
  voiceRecordingOverlay.classList.remove("is-cancelling");
  voiceRecordingOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("voice-recording-open");
  voiceRecordingOverlayOwner = null;
}

function preferredAudioMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  if (typeof window.MediaRecorder?.isTypeSupported !== "function") return "";
  return candidates.find((mimeType) => window.MediaRecorder.isTypeSupported(mimeType)) || "";
}

function audioBlobBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "").split(",", 2)[1] || ""), { once: true });
    reader.addEventListener("error", () => reject(new Error("读取录音失败，请重试")), { once: true });
    reader.readAsDataURL(blob);
  });
}

function microphoneErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return window.isSecureContext
      ? "未获得麦克风权限，请在浏览器设置中允许访问"
      : "麦克风需要 HTTPS，请通过安全地址打开页面";
  }
  if (error?.name === "NotFoundError") return "没有找到可用的麦克风";
  if (error?.name === "NotReadableError") return "麦克风正被其他应用占用";
  return error?.message || "无法启动录音，请重试";
}

function getBrowserSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function browserSpeechErrorMessage(error) {
  const code = String(error || "").toLowerCase();
  if (code.includes("notallowed") || code.includes("permission") || code.includes("blocked")) {
    return window.isSecureContext
      ? "未获得麦克风权限，请在浏览器设置中允许访问"
      : "麦克风需要 HTTPS，请通过安全地址打开页面";
  }
  if (code.includes("network")) return "语音识别网络错误，请检查网络后重试";
  if (code.includes("no-speech") || code.includes("nospeech")) return "没有检测到语音，请再试一次";
  if (code.includes("aborted")) return "已取消录音";
  return "语音识别失败，请重试";
}

function setupVoiceInput(form, options = {}) {
  const button = form.querySelector("[data-voice-input]");
  const textSurface = form.querySelector("[data-voice-text-surface]");
  const modeToggle = form.querySelector("[data-input-mode-toggle]");
  const status = form.querySelector("[data-voice-status]");
  const textarea = form.querySelector("textarea");
  const submitButton = form.querySelector('[type="submit"]');
  const compose = form.matches(".agent-compose") ? form : form.querySelector("[data-agent-compose]");
  const SpeechRecognitionCtor = getBrowserSpeechRecognition();
  const mediaRecorderSupported = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  const recordingSupported = Boolean(button && textSurface && status && (SpeechRecognitionCtor || mediaRecorderSupported));
  if (!recordingSupported) {
    if (compose) compose.dataset.inputMode = "text";
    form.dataset.inputMode = "text";
    if (modeToggle) {
      modeToggle.disabled = true;
      modeToggle.setAttribute("aria-label", "当前浏览器不支持网页录音");
      modeToggle.title = "当前浏览器不支持网页录音";
    }
    if (button?.hasAttribute("data-text-fallback")) {
      button.disabled = false;
      button.title = "当前浏览器不支持网页录音；轻点打开文字对话";
      button.addEventListener("click", () => options.onButtonTap?.());
    }
    return;
  }

  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let starting = false;
  let recording = false;
  let processing = false;
  let releaseRequested = false;
  let cancelRequested = false;
  let maximumTimer = null;
  let statusTimer = null;
  let longPressTimer = null;
  let pointerPress = null;
  let voiceAvailable = true;
  let recognition = null;

  function shouldUseBrowserSpeech() {
    return Boolean(SpeechRecognitionCtor) && state.voiceConfigured !== true;
  }

  function updateStatus(text, { error = false, clearAfter = 0 } = {}) {
    clearTimeout(statusTimer);
    status.textContent = text;
    status.classList.toggle("error", error);
    if (clearAfter) {
      statusTimer = setTimeout(() => {
        status.textContent = "";
        status.classList.remove("error");
      }, clearAfter);
    }
  }

  function stopStream() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function setRecordingUi(active) {
    form.classList.toggle("is-recording", active);
    compose?.classList.toggle("is-recording", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "松开发送" : "按住说话，松开发送");
    submitButton.disabled = active || processing || textarea.disabled || !state.agentConfigured;
  }

  function setInputMode(mode, { focus = false } = {}) {
    const nextMode = options.fixedText ? "text" : mode === "voice" ? "voice" : "text";
    form.dataset.inputMode = nextMode;
    if (compose) compose.dataset.inputMode = nextMode;
    modeToggle?.setAttribute("aria-label", nextMode === "voice" ? "切换到文本输入" : "切换到纯语音输入");
    if (focus && nextMode === "text") {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }

  function resetPointerPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    pointerPress = null;
    form.classList.remove("is-long-press-pending");
    compose?.classList.remove("is-long-press-pending");
  }

  async function finishRecording() {
    clearTimeout(maximumTimer);
    hideVoiceRecordingOverlay(controller);
    const durationMs = Math.max(0, Date.now() - startedAt);
    const mimeType = String(recorder?.mimeType || preferredAudioMimeType() || "audio/webm").split(";", 1)[0];
    const blob = new Blob(chunks, { type: mimeType });
    const cancelled = cancelRequested;
    recorder = null;
    chunks = [];
    recording = false;
    starting = false;
    setRecordingUi(false);
    stopStream();
    if (activeVoiceController === controller) activeVoiceController = null;
    if (cancelled) {
      updateStatus("已取消录音", { clearAfter: 1800 });
      updateVoiceButtonAvailability(form);
      return;
    }
    if (durationMs < 350 || blob.size < 128) {
      updateStatus("按住时间太短，请说完后再松开", { error: true, clearAfter: 3200 });
      updateVoiceButtonAvailability(form);
      return;
    }

    processing = true;
    button.classList.add("is-processing");
    updateVoiceButtonAvailability(form);
    updateStatus("正在识别并发送…");
    try {
      const result = await api("/api/agent/transcriptions", {
        method: "POST",
        body: JSON.stringify({
          mimeType,
          audioBase64: await audioBlobBase64(blob),
          durationMs
        })
      });
      textarea.value = result.text;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      options.onTranscribed?.(result.text);
      processing = false;
      button.classList.remove("is-processing");
      updateVoiceButtonAvailability(form);
      button.disabled = true;
      updateStatus("识别完成，正在发送…", { clearAfter: 1800 });
      form.requestSubmit();
    } catch (error) {
      processing = false;
      button.classList.remove("is-processing");
      updateVoiceButtonAvailability(form);
      updateStatus(error.message, { error: true, clearAfter: 4200 });
      options.onVoiceError?.(error);
      toast(error.message);
    }
  }

  const controller = {
    keepButtonEnabled: Boolean(options.keepEnabledWhenUnsupported),
    abort() {
      resetPointerPress();
      hideVoiceRecordingOverlay(controller);
      if (starting) {
        releaseRequested = true;
        cancelRequested = true;
        return;
      }
      if (shouldUseBrowserSpeech() && recognition) {
        cancelRequested = true;
        try { recognition.stop(); } catch { /* ignore */ }
        return;
      }
      if (!recording || recorder?.state === "inactive") return;
      cancelRequested = true;
      recorder.stop();
    },
    isBusy() {
      return starting || recording || processing;
    },
    isProcessing() {
      return processing;
    },
    setVoiceAvailable(available) {
      voiceAvailable = available;
    },
    switchMode(mode, options) {
      setInputMode(mode, options);
    }
  };
  voiceControllers.set(form, controller);

  async function beginBrowserSpeechRecording() {
    setRecordingUi(true);
    updateVoiceButtonAvailability(form);
    updateStatus("正在请求麦克风…");
    showVoiceRecordingOverlay(controller, { preparing: true });
    try {
      recognition = new SpeechRecognitionCtor();
      recognition.lang = "zh-CN";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let finalTranscript = "";
      let hasResult = false;

      recognition.onstart = () => {
        starting = false;
        recording = true;
        updateStatus("正在录音，松开发送");
        showVoiceRecordingOverlay(controller);
        setVoiceRecordingCancelState(controller, pointerPress?.cancelling === true);
      };

      recognition.onresult = (event) => {
        hasResult = true;
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interim += transcript;
          }
        }
        updateStatus(interim || finalTranscript || "正在听…");
      };

      recognition.onerror = (event) => {
        starting = false;
        recording = false;
        setRecordingUi(false);
        hideVoiceRecordingOverlay(controller);
        recognition = null;
        if (activeVoiceController === controller) activeVoiceController = null;
        updateVoiceButtonAvailability(form);
        const message = browserSpeechErrorMessage(event.error);
        updateStatus(message, { error: true, clearAfter: 4200 });
        options.onVoiceError?.(new Error(message));
      };

      recognition.onend = () => {
        if (!recording && !starting) return;
        const cancelled = cancelRequested;
        starting = false;
        recording = false;
        setRecordingUi(false);
        hideVoiceRecordingOverlay(controller);
        recognition = null;
        if (activeVoiceController === controller) activeVoiceController = null;
        updateVoiceButtonAvailability(form);
        if (cancelled) {
          updateStatus("已取消录音", { clearAfter: 1800 });
          return;
        }
        if (!hasResult || !finalTranscript.trim()) {
          updateStatus("没有听清，请再试一次", { error: true, clearAfter: 3200 });
          return;
        }
        textarea.value = finalTranscript.trim();
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        options.onTranscribed?.(finalTranscript.trim());
        button.classList.add("is-processing");
        updateVoiceButtonAvailability(form);
        updateStatus("识别完成，正在发送…", { clearAfter: 1800 });
        form.requestSubmit();
        button.classList.remove("is-processing");
        updateVoiceButtonAvailability(form);
      };

      recognition.start();
    } catch (error) {
      starting = false;
      recording = false;
      setRecordingUi(false);
      hideVoiceRecordingOverlay(controller);
      recognition = null;
      if (activeVoiceController === controller) activeVoiceController = null;
      updateVoiceButtonAvailability(form);
      const message = browserSpeechErrorMessage(error.message || String(error));
      updateStatus(message, { error: true, clearAfter: 4200 });
      options.onVoiceError?.(new Error(message));
    }
  }

  async function beginRecording() {
    if (button.disabled || controller.isBusy()) return;
    if (!voiceAvailable) {
      (options.onUnsupportedTap || options.onButtonTap)?.();
      return;
    }
    activeVoiceController?.abort();
    activeVoiceController = controller;
    releaseRequested = false;
    cancelRequested = false;
    starting = true;
    if (shouldUseBrowserSpeech()) {
      return beginBrowserSpeechRecording();
    }
    setRecordingUi(true);
    updateVoiceButtonAvailability(form);
    updateStatus("正在请求麦克风…");
    showVoiceRecordingOverlay(controller, { preparing: true });
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      if (releaseRequested) {
        starting = false;
        setRecordingUi(false);
        hideVoiceRecordingOverlay(controller);
        stopStream();
        if (activeVoiceController === controller) activeVoiceController = null;
        updateVoiceButtonAvailability(form);
        updateStatus(cancelRequested ? "已取消录音" : "麦克风已就绪，请重新按住说话", { clearAfter: 2600 });
        return;
      }
      const preferredMimeType = preferredAudioMimeType();
      recorder = new MediaRecorder(stream, {
        ...(preferredMimeType ? { mimeType: preferredMimeType } : {}),
        audioBitsPerSecond: 32_000
      });
      chunks = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        finishRecording().catch((error) => {
          processing = false;
          button.classList.remove("is-processing");
          updateVoiceButtonAvailability(form);
          updateStatus(error.message, { error: true, clearAfter: 4200 });
        });
      }, { once: true });
      recorder.start(250);
      startedAt = Date.now();
      starting = false;
      recording = true;
      setRecordingUi(true);
      updateVoiceButtonAvailability(form);
      updateStatus("正在录音，松开发送");
      showVoiceRecordingOverlay(controller);
      setVoiceRecordingCancelState(controller, pointerPress?.cancelling === true);
      maximumTimer = setTimeout(() => {
        updateStatus("已到 60 秒，正在识别并发送…");
        hideVoiceRecordingOverlay(controller);
        if (recorder?.state === "recording") recorder.stop();
      }, MAX_VOICE_RECORDING_MS);
    } catch (error) {
      starting = false;
      recording = false;
      setRecordingUi(false);
      hideVoiceRecordingOverlay(controller);
      stopStream();
      if (activeVoiceController === controller) activeVoiceController = null;
      updateVoiceButtonAvailability(form);
      const message = microphoneErrorMessage(error);
      updateStatus(message, { error: true, clearAfter: 4200 });
      options.onVoiceError?.(new Error(message));
    }
  }

  function releaseRecording(cancel = false) {
    if (starting) {
      releaseRequested = true;
      cancelRequested = cancel;
      hideVoiceRecordingOverlay(controller);
      return;
    }
    if (shouldUseBrowserSpeech() && recognition) {
      cancelRequested = cancel;
      try { recognition.stop(); } catch { /* ignore */ }
      return;
    }
    if (!recording || recorder?.state !== "recording") return;
    cancelRequested = cancel;
    hideVoiceRecordingOverlay(controller);
    recorder.stop();
  }

  function focusTextarea() {
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function handlePointerDown(event, source, { delayed = false } = {}) {
    if (event.button !== 0) return;
    if (button.disabled || controller.isBusy()) return;
    event.preventDefault();
    if (!voiceAvailable) {
      (options.onUnsupportedTap || options.onButtonTap)?.();
      return;
    }
    resetPointerPress();
    source.setPointerCapture?.(event.pointerId);
    pointerPress = {
      pointerId: event.pointerId,
      source,
      startX: event.clientX,
      startY: event.clientY,
      activated: !delayed,
      suppressTap: false,
      cancelling: false
    };
    if (!delayed) {
      beginRecording();
      return;
    }
    form.classList.add("is-long-press-pending");
    compose?.classList.add("is-long-press-pending");
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (!pointerPress) return;
      pointerPress.activated = true;
      form.classList.remove("is-long-press-pending");
      compose?.classList.remove("is-long-press-pending");
      navigator.vibrate?.(12);
      beginRecording();
    }, VOICE_LONG_PRESS_MS);
  }

  function handlePointerMove(event) {
    if (!pointerPress || pointerPress.pointerId !== event.pointerId) return;
    const horizontalDistance = Math.abs(event.clientX - pointerPress.startX);
    const verticalDistance = Math.abs(event.clientY - pointerPress.startY);
    if (!pointerPress.activated) {
      if (Math.max(horizontalDistance, verticalDistance) > 12) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        pointerPress.suppressTap = true;
        form.classList.remove("is-long-press-pending");
        compose?.classList.remove("is-long-press-pending");
      }
      return;
    }
    event.preventDefault();
    const cancelling = pointerPress.startY - event.clientY >= VOICE_CANCEL_DISTANCE_PX;
    if (cancelling === pointerPress.cancelling) return;
    pointerPress.cancelling = cancelling;
    setVoiceRecordingCancelState(controller, cancelling);
  }

  function handlePointerUp(event) {
    if (!pointerPress || pointerPress.pointerId !== event.pointerId) return;
    event.preventDefault();
    const { activated, cancelling, source, suppressTap } = pointerPress;
    resetPointerPress();
    if (activated) {
      releaseRecording(cancelling);
      return;
    }
    if (!suppressTap && source === textSurface) focusTextarea();
    if (!suppressTap && source === button) options.onButtonTap?.();
  }

  function handlePointerCancel(event) {
    if (!pointerPress || pointerPress.pointerId !== event.pointerId) return;
    const activated = pointerPress.activated;
    resetPointerPress();
    if (activated) releaseRecording(true);
  }

  if (options.voiceFromTextSurface !== false) {
    textSurface.addEventListener("pointerdown", (event) => handlePointerDown(event, textSurface, { delayed: true }));
    textSurface.addEventListener("pointermove", handlePointerMove);
    textSurface.addEventListener("pointerup", handlePointerUp);
    textSurface.addEventListener("pointercancel", handlePointerCancel);
    textSurface.addEventListener("contextmenu", (event) => {
      if (form.classList.contains("is-long-press-pending") || controller.isBusy()) event.preventDefault();
    });
  }
  button.addEventListener("pointerdown", (event) => handlePointerDown(event, button, { delayed: options.buttonLongPress === true }));
  button.addEventListener("pointermove", handlePointerMove);
  button.addEventListener("pointerup", handlePointerUp);
  button.addEventListener("pointercancel", handlePointerCancel);
  button.addEventListener("keydown", (event) => {
    if (![" ", "Enter"].includes(event.key) || event.repeat) return;
    event.preventDefault();
    if (options.buttonLongPress) {
      options.onButtonTap?.();
      return;
    }
    beginRecording();
  });
  button.addEventListener("keyup", (event) => {
    if (![" ", "Enter"].includes(event.key)) return;
    event.preventDefault();
    if (options.buttonLongPress) return;
    releaseRecording(false);
  });
  button.addEventListener("click", (event) => event.preventDefault());
  button.addEventListener("contextmenu", (event) => event.preventDefault());
  modeToggle?.addEventListener("click", () => {
    if (modeToggle.disabled || controller.isBusy()) return;
    setInputMode(form.dataset.inputMode === "voice" ? "text" : "voice", { focus: form.dataset.inputMode === "voice" });
  });
  button.hidden = false;
  setInputMode(options.defaultMode || "voice");
  updateVoiceButtonAvailability(form);
}

initializeVoiceRecordingWave();
enableEnterToSubmit($("#agentForm"));
enableEnterToSubmit($("#quickAgentForm"));
enableAgentTextareaAutoGrow($("#agentForm"));
enableAgentTextareaAutoGrow($("#quickAgentForm"));
setupVoiceInput($("#agentForm"));
setupVoiceInput($("#quickAgentForm"), {
  buttonLongPress: false,
  defaultMode: "text",
  fixedText: true,
  voiceFromTextSurface: false,
  keepEnabledWhenUnsupported: true,
  onButtonTap: () => openQuickAgent(),
  onUnsupportedTap: () => toast("当前浏览器或账号暂不支持语音识别，请直接用文字输入"),
  onTranscribed: () => openQuickAgent({ focus: false, loadMessages: false }),
  onVoiceError: () => openQuickAgent({ focus: false })
});

/* =========================================================
   食光家庭版 · 新增页面渲染（台账 / 菜谱 / 预警 / 个人中心）
   ========================================================= */
function renderLedger() {
  const data = demo.ledger;
  const last = data.at(-1);
  const prev = data.length >= 2 ? data.at(-2) : null;
  const totalSave = demo.ledgerTxns.savings.reduce((sum, item) => sum + item.amount, 0);
  const diffBuy = prev ? prev.buy - last.buy : 0;
  const saveDelta = prev
    ? (diffBuy >= 0 ? `较上月省下 ¥${Math.abs(diffBuy).toFixed(0)}（-${Math.round((diffBuy / prev.buy) * 100)}%）` : `较上月多花 ¥${Math.abs(diffBuy).toFixed(0)}（+${Math.round((-diffBuy / prev.buy) * 100)}%）`)
    : "暂无上月对比数据";
  const wasteRate = ((last.waste / last.buy) * 100).toFixed(1);
  const ledgerSummary = $("#ledgerSummary");
  if (ledgerSummary) ledgerSummary.innerHTML = `
    <div class="card kpi card-hover ledger-kpi-clickable" style="grid-column:span 4" data-ledger-jump="purchase">
      <div class="kpi-top">
        <div class="kpi-ico" style="background:var(--green-50);color:var(--fresh)"><svg class="ic ic-20"><use href="#i-cart"/></svg></div>
        <span class="kpi-trend">本月</span>
      </div>
      <div><div class="kpi-n num" style="color:var(--fresh)">¥${last.buy.toFixed(0).toLocaleString("zh-CN")}</div><div class="kpi-l">本月采购</div><div class="kpi-sub">${saveDelta}</div></div>
    </div>
    <div class="card kpi card-hover ledger-kpi-clickable" style="grid-column:span 4" data-ledger-jump="waste">
      <div class="kpi-top">
        <div class="kpi-ico" style="background:var(--red-100);color:var(--expired)"><svg class="ic ic-20"><use href="#i-trash"/></svg></div>
        <span class="kpi-trend" style="background:var(--red-100);color:#B32A30">待改进</span>
      </div>
      <div><div class="kpi-n num" style="color:var(--expired)">¥${last.waste.toFixed(0).toLocaleString("zh-CN")}</div><div class="kpi-l">本月浪费</div><div class="kpi-sub">浪费率 ${wasteRate}%，低于同小区平均 11%</div></div>
    </div>
    <div class="card kpi card-hover ledger-kpi-clickable" style="grid-column:span 4" data-ledger-jump="savings">
      <div class="kpi-top">
        <div class="kpi-ico" style="background:var(--amber-100);color:var(--expiring)"><svg class="ic ic-20"><use href="#i-leaf"/></svg></div>
        <span class="kpi-trend">自 2026 年 2 月</span>
      </div>
      <div><div class="kpi-n num" style="color:var(--expiring)">¥${totalSave.toFixed(0).toLocaleString("zh-CN")}</div><div class="kpi-l">累计减少浪费</div><div class="kpi-sub">使用食光以来</div></div>
    </div>`;
  // 绑定 KPI 卡片点击跳转对应内页
  document.querySelectorAll("#ledgerSummary .ledger-kpi-clickable").forEach((card) => {
    card.addEventListener("click", () => {
      const jump = card.dataset.ledgerJump;
      state.ledgerTab = jump || "purchase";
      if (typeof window.showPanel === "function") window.showPanel("ledger-list");
      else if (typeof setView === "function") setView("ledger-list");
      renderLedgerList();
    });
  });
  const maxBuy = Math.max(...data.map((d) => d.buy));
  const ledgerChart = $("#ledgerChart");
  if (ledgerChart) ledgerChart.innerHTML = data.map((d) => {
    return `<div class="chart-col"><div class="chart-bars">
      <span class="chart-bar-wrap"><span class="chart-bar-tip">采购 ¥${d.buy.toLocaleString("zh-CN")}</span><span class="chart-bar" style="background:var(--fresh);height:${(d.buy / maxBuy * 100).toFixed(0)}%"></span></span>
      <span class="chart-bar-wrap"><span class="chart-bar-tip">浪费 ¥${d.waste.toLocaleString("zh-CN")}</span><span class="chart-bar" style="background:var(--red);height:${(d.waste / maxBuy * 100).toFixed(0)}%"></span></span>
    </div><span class="muted small">${escapeHtml(d.m)}</span></div>`;
  }).join("");
}

function renderLedgerList() {
  const tab = state.ledgerTab;
  const body = $("#ledgerList");
  if (!body) return;
  if (tab === "purchase") {
    body.innerHTML = `<table class="table"><thead><tr><th>日期</th><th>类型</th><th>物品</th><th class="num">金额</th><th>说明</th></tr></thead><tbody>
      ${demo.ledgerTxns.purchase.map((t) => `<tr><td class="num">${t.d}</td><td><span class="pill pill-fresh">采购</span></td><td><b>${escapeHtml(t.n)}</b></td><td class="num">¥${t.amount.toFixed(2)}</td><td>${escapeHtml(t.q)}</td></tr>`).join("")}
    </tbody></table>`;
  } else if (tab === "waste") {
    body.innerHTML = `<table class="table"><thead><tr><th>日期</th><th>类型</th><th>物品</th><th class="num">金额</th><th>原因</th></tr></thead><tbody>
      ${demo.ledgerTxns.waste.map((t) => `<tr><td class="num">${t.d}</td><td><span class="pill pill-expired">浪费</span></td><td><b>${escapeHtml(t.n)}</b></td><td class="num" style="color:var(--expired)">¥${t.amount.toFixed(2)}</td><td>${escapeHtml(t.reason)}</td></tr>`).join("")}
    </tbody></table>`;
  } else {
    body.innerHTML = `<table class="table"><thead><tr><th>月份</th><th class="num">节省金额</th></tr></thead><tbody>
      ${demo.ledgerTxns.savings.map((t) => `<tr><td><b>${escapeHtml(t.m)}</b></td><td class="num" style="color:var(--fresh)">¥${t.amount.toFixed(0)}</td></tr>`).join("")}
    </tbody></table>`;
  }
  document.querySelectorAll("#ledgerListTabs .ledger-list-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.ledgerTab === tab);
  });
}

function menuCard(m) {
  // 家庭 web 复刻：本周菜单小卡（span 3）
  return `<article class="card recipe card-hover" style="grid-column:span 3" role="button" tabindex="0" data-recipe="${escapeHtml(m.n)}">
    <div class="recipe-img" style="background:${m.g}"><span class="tag">${escapeHtml(m.d || m.tag || "")}</span><svg class="ic ic-28"><use href="#i-book"/></svg></div>
    <div class="recipe-b"><b>${escapeHtml(m.n)}</b><span class="small muted-2">${escapeHtml(m.t || "")}</span>${m.c?.length ? `<div class="chips">${m.c.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("")}</div>` : ""}</div>
  </article>`;
}

function recipeCard(r) {
  // 家庭 web 复刻：推荐/今日菜谱大卡（span 4）
  return `<article class="card recipe card-hover" style="grid-column:span 4" role="button" tabindex="0" data-recipe="${escapeHtml(r.t)}">
    <div class="recipe-img" style="background:${r.g}"><span class="tag">${escapeHtml(r.tag || "")}</span><svg class="ic ic-28"><use href="#i-book"/></svg></div>
    <div class="recipe-b"><b>${escapeHtml(r.t)}</b><span class="small muted-2">${escapeHtml(r.m)}</span>${r.c?.length ? `<div class="chips">${r.c.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("")}</div>` : ""}</div>
  </article>`;
}

function renderRecipes() {
  const fillGrid = (id, html, emptyText) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html || `<div class="recipe-empty muted">${emptyText}</div>`;
  };
  const today = demo.todayMenu.map(menuCard).join("");
  const weekly = demo.weeklyMenu.map(menuCard).join("");
  const base = demo.recipesBase.map(recipeCard).join("");
  fillGrid("todayMenuGrid", today, "今日暂无推荐菜谱");
  fillGrid("weeklyMenuGrid", weekly, "本周暂无菜单");
  fillGrid("recipeGrid", base, "还没有菜谱，点「AI 生成」让小食为你推荐");
  updateRecipeAdvice();
}

async function generateRecipe() {
  const button = $("#recipeGenerate");
  button.disabled = true;
  const originalLabel = button.innerHTML;
  button.innerHTML = "✨ 小食正在生成…";
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const expiring = state.foods.filter((f) => f.status === "expiring" || f.status === "expired").map((f) => f.name);
  const base = demo.recipesBase[Math.floor(Math.random() * demo.recipesBase.length)];
  const generated = {
    t: `小食推荐·${base.t}`,
    m: base.m,
    g: "linear-gradient(150deg,#6FE3B0,#0E9F6E)",
    tag: "小食生成 · 实时",
    c: base.c,
    ing: base.ing,
    step: `结合${expiring.length ? "临期的 " + expiring.slice(0, 3).join("、") + "，" : "现有库存，"}推荐${base.t}：${base.step}`
  };
  demo.aiRecipes.unshift(generated);
  updateRecipeAdvice();
  button.disabled = false;
  button.innerHTML = originalLabel;
  renderRecipes();
  toast("小食已为你生成一道菜谱");
}

function updateRecipeAdvice() {
  const tag = $("#recipeAdviceTag");
  const body = $("#recipeAdviceBody");
  if (!tag || !body) return;
  const expiringFoods = state.foods.filter((f) => f.status === "expiring" || f.status === "expired");
  const expiringNames = expiringFoods.map((f) => f.name);
  tag.textContent = `基于 ${expiringFoods.length} 件临期食材`;
  if (expiringFoods.length >= 3) {
    const sample = expiringNames.slice(0, 3).join("、");
    body.textContent = `冰箱里的 ${sample} 都在 72 小时内到期。我按这三种先排了今晚和明天的菜，够 4 个人吃。`;
  } else if (expiringFoods.length > 0) {
    body.textContent = `冰箱里的 ${expiringNames.join("、")} 即将到期，建议这两天优先吃掉它们。`;
  } else {
    body.textContent = "冰箱里目前没有快到期的食材。点击右上角「AI 生成今日菜谱」让小食帮你设计一份新菜单。";
  }
}

function alertGroupSources() {
  return [
    { key: "expired", label: "已过期", items: state.foods.filter((f) => f.status === "expired") },
    { key: "h24", label: "今天 / 1 天内到期", items: state.foods.filter((f) => f.status !== "expired" && f.daysRemaining >= 0 && f.daysRemaining <= 1) },
    { key: "h72", label: "2-3 天内到期", items: state.foods.filter((f) => f.status !== "expired" && f.daysRemaining >= 2 && f.daysRemaining <= 3) }
  ];
}

function renderAlerts() {
  const tab = state.alertTab;
  const groups = alertGroupSources().map((g) => ({
    ...g,
    items: g.items.filter((f) => (tab === "done") === state.alertHandled.has(f.id))
  }));
  const visible = groups.filter((g) => g.items.length);
  const setKpi = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const expired = state.foods.filter((f) => f.status === "expired").length;
  const expiring = state.foods.filter((f) => f.status !== "expired" && (f.daysRemaining ?? 99) >= 0 && (f.daysRemaining ?? 99) <= 1).length;
  const soon = state.foods.filter((f) => f.status !== "expired" && (f.daysRemaining ?? 99) >= 2 && (f.daysRemaining ?? 99) <= 3).length;
  setKpi("kpiExpired", expired);
  setKpi("kpiExpiring", expiring);
  setKpi("kpiSoon", soon);
  setKpi("alertCount", `${expired + expiring + soon} 件待处理`);
  const alertEmptyEl = $("#alertEmpty");
  const alertIsEmpty = !visible.length;
  alertEmptyEl.classList.toggle("hidden", !alertIsEmpty);
  const alertTitleEl = alertEmptyEl.querySelector("b");
  const alertDescEl = alertEmptyEl.querySelector("div > span");
  if (alertTitleEl) alertTitleEl.textContent = tab === "done" ? "暂无已处理预警" : "暂无待处理预警";
  if (alertDescEl) alertDescEl.textContent = tab === "done" ? "处理过的预警会出现在这里。" : "冰箱里的食材都在安全期内，继续保持～";
  $("#alertGroups").innerHTML = visible.length ? visible.map((g) => `
    <section class="alert-group">
      <div class="alert-group-head"><span class="alert-dot ${g.key}"></span><strong>${escapeHtml(g.label)}</strong><span>${g.items.length} 件</span></div>
      ${g.items.map((f) => `<div class="alert-item ${state.alertHandled.has(f.id) ? "done" : ""}">
        <span class="alert-name">${escapeHtml(f.name)}</span>
        <span class="alert-meta">${escapeHtml(f.location || "未分区")} · ${escapeHtml(statusText(f))}</span>
        <span class="alert-spacer"></span>
        ${state.alertHandled.has(f.id) ? '<span class="muted">已处理</span>' : `<button class="alert-handle" type="button" data-alert-handle="${f.id}">处理</button>`}
      </div>`).join("")}
    </section>`).join("") : "";
  document.querySelectorAll(".alert-tab").forEach((b) => b.classList.toggle("active", b.dataset.alertTab === tab));
}

function handleAlertHandle(id) {
  const item = state.foods.find((f) => f.id === id);
  state.alertHandled.add(id);
  toast(item ? `已标记处理：${item.name}` : "已标记处理");
  renderAlerts();
}

function notificationIcon(key, activityType) {
  if (key.startsWith("alert-")) {
    const item = state.foods.find((f) => `alert-${f.id}` === key);
    if (item?.status === "expired") return { svg: `<svg aria-hidden="true"><use href="#i-alert"/></svg>`, cls: "alert-expired" };
    return { svg: `<svg aria-hidden="true"><use href="#i-clock"/></svg>`, cls: "alert-expiring" };
  }
  const type = activityType || "";
  if (type === "food_created") return { svg: `<svg aria-hidden="true"><use href="#i-plus"/></svg>`, cls: "activity" };
  if (type === "food_updated") return { svg: `<svg aria-hidden="true"><use href="#i-edit"/></svg>`, cls: "activity" };
  if (type === "food_deleted") return { svg: `<svg aria-hidden="true"><use href="#i-trash"/></svg>`, cls: "activity" };
  if (type.startsWith("household_")) return { svg: `<svg aria-hidden="true"><use href="#i-users"/></svg>`, cls: "activity" };
  return { svg: `<svg aria-hidden="true"><use href="#i-check"/></svg>`, cls: "system" };
}

function renderNotifications() {
  const list = $("#notificationList");
  if (!list) return;
  const entries = [];
  // 1. 食材临期/过期预警（未处理的物品）
  state.foods.forEach((item) => {
    if (item.status === "handled") return;
    const key = `alert-${item.id}`;
    if (item.status === "expired") {
      entries.push({ key, activityType: null, title: `${item.name}已过期 ${Math.abs(item.daysRemaining)} 天，建议尽快处理`, time: "现在", unread: !state.notifRead.has(key) });
    } else if (item.daysRemaining <= 3) {
      const when = item.daysRemaining === 0 ? "今天" : `${item.daysRemaining} 天内`;
      entries.push({ key, activityType: null, title: `${item.name}将在 ${when} 到期`, time: "现在", unread: !state.notifRead.has(key) });
    }
  });
  // 2. 家人动态（最近 10 条）
  state.activities.slice(0, 10).forEach((activity) => {
    const key = `act-${activity.id}`;
    entries.push({
      key,
      activityType: activity.type,
      title: `${activityActor(activity)} ${activity.title}`,
      time: relativeActivityTime(activity.createdAt),
      unread: !state.notifRead.has(key)
    });
  });
  if (!entries.length) {
    list.innerHTML = `<p class="notif-empty muted">暂无消息</p>`;
    return;
  }
  list.innerHTML = entries.map((n) => {
    const { svg, cls } = notificationIcon(n.key, n.activityType);
    return `
    <article class="notif-item ${cls} ${n.unread ? "unread" : ""}" data-notif-key="${escapeHtml(n.key)}">
      <span class="notif-icon">${svg}</span>
      <div class="notif-body"><div class="notif-title">${escapeHtml(n.title)}</div><div class="notif-time">${escapeHtml(n.time)}</div></div>
      ${n.unread ? '<span class="notif-dot" aria-hidden="true"></span>' : ""}
    </article>`;
  }).join("");
  updateNotificationBadge(entries.filter((n) => n.unread).length);
}

function updateNotificationBadge(count) {
  ["#notiBadge", "#mobileNotiBadge"].forEach((sel) => {
    const badge = $(sel);
    if (!badge) return;
    badge.textContent = String(count);
    badge.classList.toggle("hidden", count === 0);
  });
}

function updateNotificationBadgeFromState() {
  let count = 0;
  state.foods.forEach((item) => {
    if (item.status === "handled") return;
    const key = `alert-${item.id}`;
    if (item.status === "expired" || item.daysRemaining <= 3) {
      if (!state.notifRead.has(key)) count++;
    }
  });
  state.activities.slice(0, 10).forEach((activity) => {
    if (!state.notifRead.has(`act-${activity.id}`)) count++;
  });
  updateNotificationBadge(count);
}

function renderSettings() {
  const warnDays = $("#prefWarnDays");
  if (warnDays) warnDays.value = String(state.pref.warnDays);
  const notifyExpire = $("#prefNotifyExpire");
  if (notifyExpire) notifyExpire.checked = state.pref.notifyExpire;
  const prefDaily = $("#prefDaily");
  if (prefDaily) prefDaily.checked = state.pref.daily;
}

function renderMember() {
  const detail = $("#memberDetail");
  if (!detail) return;
  detail.innerHTML = `
    <div class="plan-card current">
      <span class="plan-title">食光基础会员</span>
      <p class="muted">当前账号免费享用全部保鲜、台账与预警功能。</p>
      <button class="primary" type="button" id="upgradeMember">升级 AI 膳养会员</button>
    </div>
    <div class="plan-card">
      <span class="plan-title">AI 膳养方案</span>
      <p class="muted">¥38 / 月 · 智能生成消耗菜谱与一周膳食计划。</p>
    </div>`;
}

/* 菜谱详情面板（家庭 web 复刻：data-view-panel="recipes-detail"） */
function openRecipeDetail(name) {
  const recipe = [...demo.recipesBase, ...demo.aiRecipes].find((r) => r.t === name)
    || demo.todayMenu.find((m) => m.n === name);
  if (!recipe) return;
  const titleEl = $("#recipeDetailTitle");
  if (titleEl) titleEl.textContent = recipe.t;
  const hero = $("#recipeDetailHero");
  if (hero) hero.style.background = recipe.g;
  const heroName = $("#recipeDetailHeroName");
  if (heroName) heroName.textContent = recipe.t;
  const tag = $("#recipeDetailTag");
  if (tag) tag.textContent = recipe.tag || "";
  const heroTag = $("#recipeDetailHeroTag");
  if (heroTag) heroTag.textContent = recipe.tag || "";
  const nutrition = $("#recipeDetailNutrition");
  if (nutrition) nutrition.textContent = recipe.tag ? recipe.tag.replace(/用掉\s*\d+\s*样.*/, "家常菜") : "家常菜";
  const difficulty = $("#recipeDifficulty");
  if (difficulty) difficulty.textContent = (recipe.ing && recipe.ing.length >= 6) ? "普通" : "容易";
  const meta = $("#recipeDetailMeta");
  if (meta) meta.textContent = recipe.m || "";
  const stepText = recipe.step || "";
  const stepItems = stepText.split(/[；;\n]+/).map((s) => s.trim()).filter(Boolean);
  const steps = $("#recipeDetailSteps");
  if (steps) {
    if (steps.tagName === "OL") {
      steps.innerHTML = stepItems.map((s) => `<li class="recipe-step-item">${escapeHtml(s)}</li>`).join("");
    } else {
      steps.textContent = stepText;
    }
  }
  const ingredients = recipe.ing || recipe.c || [];
  const chips = $("#recipeDetailChips");
  if (chips) {
    const ingredientItems = ingredients.map((line) => {
      const m = line.match(/^(.+?)\s*(\d+(?:\.\d+)?\s*[a-zA-Z\u4e00-\u9fa5]+.*)$/);
      if (m) return { name: m[1].trim(), qty: m[2].trim() };
      return { name: line, qty: "" };
    });
    chips.innerHTML = ingredientItems.length
      ? ingredientItems.map((i) => `<li class="recipe-ingredient-item"><span>${escapeHtml(i.name)}</span>${i.qty ? `<strong>${escapeHtml(i.qty)}</strong>` : ""}</li>`).join("")
      : `<li class="recipe-ingredient-item muted">暂无食材信息</li>`;
  }
  const expiring = $("#recipeDetailExpiring");
  if (expiring) {
    const expiringFoods = state.foods.filter((f) => f.status === "expiring" || f.status === "expired").slice(0, 4);
    expiring.innerHTML = expiringFoods.length ? expiringFoods.map((f) => `
      <div class="alert-row recipe-expiring-row">
        <span class="ar-ico recipe-expiring-ico" aria-hidden="true"><svg class="ic ic-20"><use href="#i-clock"/></svg></span>
        <div class="recipe-expiring-info">
          <strong class="ar-name">${escapeHtml(f.name)}</strong>
          <span class="ar-meta">${escapeHtml(statusText(f))}</span>
        </div>
        <div class="recipe-expiring-date">
          <b>${escapeHtml(f.expiresOn || "")}</b>
          <span>到期</span>
        </div>
      </div>`).join("")
      : `<p class="muted">当前没有临期食材，这道菜可以随时开做。</p>`;
  }
  if (typeof window.showPanel === "function") window.showPanel("recipes-detail");
}

/* 小食 AI 助手浮标 */
function toggleCopilot() {
  const dialog = $("#quickAgentDialog");
  if (dialog.classList.contains("hidden")) openQuickAgent({ focus: true, loadMessages: true });
  else closeQuickAgent();
}

/* 个人中心 / 浮标 / 新页面交互接线 */
function wireFoodTime() {
  const chip = $("#userChip");
  const menu = $("#userMenu");
  // 个人中心下拉的打开/关闭由 index.html 内联脚本统一用 .hidden 类管理（避免重复监听导致点击抵消）。
  // 这里仅在点击菜单内导航项 [data-view-target] 时关闭下拉，保持单选体验。
  if (menu && chip) {
    menu.addEventListener("click", (event) => {
      if (event.target.closest("[data-view-target]")) {
        menu.classList.add("hidden");
        chip.setAttribute("aria-expanded", "false");
      }
    });
  }

  document.querySelectorAll(".alert-tab").forEach((button) => {
    button.addEventListener("click", () => { state.alertTab = button.dataset.alertTab; renderAlerts(); });
  });

  if ($("#alertGroups")) $("#alertGroups").addEventListener("click", (event) => {
    const handle = event.target.closest("[data-alert-handle]");
    if (handle) handleAlertHandle(Number(handle.dataset.alertHandle));
  });

  document.querySelectorAll("#ledgerListTabs .ledger-list-tab").forEach((button) => {
    button.addEventListener("click", () => { state.ledgerTab = button.dataset.ledgerTab; renderLedgerList(); });
  });

  const recipeGenerate = $("#recipeGenerate");
  if (recipeGenerate) recipeGenerate.addEventListener("click", generateRecipe);
  document.querySelectorAll("#todayMenuGrid, #weeklyMenuGrid, #recipeGrid, #overviewRecipes").forEach((grid) => {
    grid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-recipe]");
      if (card) openRecipeDetail(card.dataset.recipe);
    });
  });
  const membersInvite = $("#membersInvite");
  if (membersInvite) membersInvite.addEventListener("click", () => $("#createHouseholdInvite")?.click());
  const notifMarkAll = $("#markAllReadBtn") || $("#notifMarkAll");
  if (notifMarkAll) notifMarkAll.addEventListener("click", () => {
    state.foods.forEach((item) => state.notifRead.add(`alert-${item.id}`));
    state.activities.forEach((activity) => state.notifRead.add(`act-${activity.id}`));
    renderNotifications();
    toast("已全部标记为已读");
  });
  const notifList = $("#notificationList");
  if (notifList) notifList.addEventListener("click", (event) => {
    const entry = event.target.closest("[data-notif-key]");
    if (!entry) return;
    const key = entry.dataset.notifKey;
    state.notifRead.add(key);
    renderNotifications();
    if (key.startsWith("alert-")) setView("alerts", { scroll: false });
  });
  const prefSave = $("#prefSave");
  if (prefSave) prefSave.addEventListener("click", () => {
    const warnDays = $("#prefWarnDays");
    const notifyExpire = $("#prefNotifyExpire");
    const daily = $("#prefDaily");
    if (warnDays) state.pref.warnDays = Number(warnDays.value);
    if (notifyExpire) state.pref.notifyExpire = notifyExpire.checked;
    if (daily) state.pref.daily = daily.checked;
    toast("偏好设置已保存");
  });
  const memberDetail = $("#memberDetail");
  if (memberDetail) memberDetail.addEventListener("click", (event) => {
    if (event.target.closest("#upgradeMember")) toast("会员开通流程为演示项");
  });

  // 账户管理：修改昵称 / 邮箱 / 密码（PATCH /api/auth/me）
  const accountManageForm = $("#accountManageForm");
  if (accountManageForm) {
    // 打开偏好设置时预填当前账号信息
    const fillAccountForm = () => {
      const displayName = $("#accountDisplayName");
      if (displayName && state.user) displayName.value = state.user.displayName || "";
      const email = $("#accountEmail");
      if (email && state.user) email.value = state.user.email || "";
      const pw = $("#accountPassword");
      if (pw) pw.value = "";
      const pw2 = $("#accountPasswordConfirm");
      if (pw2) pw2.value = "";
    };
    fillAccountForm();
    const prefViewBtn = document.querySelector('#userMenu button[data-view-target="account"], #userMenu button[data-view-target="agent-settings"], #userMenu button[data-view-target="preferences"]');
    prefViewBtn?.addEventListener("click", () => setTimeout(fillAccountForm, 50));
    accountManageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {};
      const displayNameInput = $("#accountDisplayName");
      const email = $("#accountEmail");
      const password = $("#accountPassword");
      const passwordConfirm = $("#accountPasswordConfirm");
      if (displayNameInput && displayNameInput.value.trim()) payload.displayName = displayNameInput.value.trim();
      if (email && email.value.trim()) payload.email = email.value.trim();
      if (password && password.value) {
        if (password.value.length < 6) { toast("密码至少 6 位"); return; }
        if (password.value !== passwordConfirm?.value) { toast("两次输入的新密码不一致"); return; }
        payload.password = password.value;
      }
      if (!Object.keys(payload).length) { toast("没有需要保存的修改"); return; }
      const submitBtn = accountManageForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const result = await api("/api/auth/me", { method: "PATCH", body: JSON.stringify(payload) });
        state.user = result.user;
        // 同步顶栏/下拉显示名
        const name = displayName(result.user);
        const userName = $("#userName");
        if (userName) userName.textContent = name;
        const menuName = $("#menuName");
        if (menuName) menuName.textContent = name;
        const menuAvatar = $("#menuAvatar");
        if (menuAvatar) menuAvatar.textContent = (name || "食").slice(0, 1);
        const mobileUserNameEl2 = $("#mobileUserName");
        if (mobileUserNameEl2) mobileUserNameEl2.textContent = name;
        const mobileUserAvatarEl2 = $("#mobileUserAvatar");
        if (mobileUserAvatarEl2) mobileUserAvatarEl2.textContent = (name || "食").slice(0, 1);
        fillAccountForm();
        toast("账户信息已保存");
      } catch (error) {
        toast(`保存失败：${error.message}`);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}

wireFoodTime();

function escapeHtml(text) {
  return String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

renderCategoryPicker();
initialize().catch((error) => toast(error.message));
