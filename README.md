# 食光 FoodTime

> 把冰箱里的每一份食材，都放回它该被吃掉的那一天。让家里少一点浪费，多一点好好吃饭的从容。

**食光** 是一个面向家庭的食材有效期管理 Web 应用：录入一次，自动做 72 小时 / 24 小时 / 过期三级预警，支持家庭成员邀请、内置 AI 助手、MCP 接入与电子墨水屏设备帧推送。

本项目以「可被兴趣开发者二次开发」为目标开源，包含完整可运行的后端、前端源码、单元测试与部署配置。

---

## 功能特性

- **食材管理**：添加 / 编辑 / 删除食材，支持到期日或「起始日 + 有效天数」两种录入方式，地点复用与搜索筛选。
- **保质期自动倒数**：按 `Asia/Shanghai` 时区计算状态，已过期、临期（≤3 天）、充足三态预警。
- **家庭成员邀请闭环**：账户页生成邀请码与注册链接，受邀人注册即绑定加入同一家庭，权限按家庭隔离。
- **内置 AI 助手（可选）**：管理员可配置系统级 API Key，用户也可填写自己的 Key；删除等敏感操作需二次确认。所有 Key 使用 AES-256-GCM 加密存储。
- **MCP 接入**：提供带个人访问令牌认证的 Streamable HTTP MCP，供 Codex 等 Agent 管理当前家庭食材。
- **响应式工作台**：原生 JS 单页应用，移动端与桌面端自适应，无需构建步骤。

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 运行环境 | Node.js ≥ 22.5（`node:http` 内置服务，无需框架） |
| 数据存储 | `node:sqlite`（SQLite） / 可选 `better-sqlite3` |
| 前端 | 原生 HTML + CSS + JavaScript SPA（`public/`） |
| 部署 | 本地直接运行，或部署到 EdgeOne Makers（静态资源 + 云函数） |
| 测试 | Node 内置 `node --test` |

---

## 本地启动

需要 **Node.js 22.5 或更高版本**。

```sh
git clone <your-fork-url> foodtime
cd foodtime
npm install
npm start
```

打开浏览器访问：

```text
http://127.0.0.1:8790
```

首次启动会自动创建 Git 忽略的 SQLite 数据库 `data/fridge_v2.sqlite` 与示例数据，并使用以下演示配置（来自 `config.example.json`）：

```text
账号: admin
密码: fridge-demo
演示设备 token: local-fridge-device-token
```

> ⚠️ 将服务暴露到本机以外网络前，请复制 `config.example.json` 为 `config.json` 并更换所有密钥。
> `config.json` 与 `data/` 均已排除在 Git 跟踪之外。

如需自定义配置：

```sh
cp config.example.json config.json
# 编辑 config.json，至少修改 adminPassword 与 credentialEncryptionKey
```

```jsonc
{
  "host": "0.0.0.0",
  "port": 8790,
  "adminLogin": "admin",
  "adminPassword": "change-this-password",
  "credentialEncryptionKey": "replace-with-a-long-random-secret"
}
```

---

## 开发与测试

```sh
npm run check     # 语法检查 src/ 与 public/ 下所有 JS
npm test          # 运行 test/ 下的单元测试（Node 内置 test runner）
npm run dev       # 监听文件变化的热重载模式
```

H5 页面启动后自带示例食材，可直接体验。

---

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `SYSTEM_AI_API_KEY` | 系统级 LLM Key，未配置时 AI 助手不可用（用户仍可填个人 Key） |
| `SYSTEM_AI_MODEL` | 默认模型，如 `deepseek-chat` |
| `SYSTEM_AI_BASE_URL` | OpenAI 兼容 Base URL |
| `PAGES_BLOB_DEPLOY_CREDENTIAL` | EdgeOne Makers 注入的 Blob 持久化凭据；本地留空则快照功能自动关闭 |

源码中**不包含任何硬编码密钥**，所有凭据均通过环境变量或配置文件注入。

---

## 部署到 EdgeOne Makers

项目已内置 `edgeone.json` 与 `.edgeone/` 部署配置，可直接发布为云端服务：

```sh
# 安装并登录 EdgeOne Makers CLI
npm i -g edgeone
edgeone makers link

# 部署（静态资源 + 云函数后端）
edgeone makers deploy
```

部署后可为自定义域名绑定本项目（本项目线上示例为 `https://home.yitongxue.art/`）。Makers 的 Blob 持久化与构建注意事项，请参考 EdgeOne Makers 官方文档。

---

## 目录结构

```text
foodtime/
├── src/                  # 后端源码（Node 内置 http 服务 + SQLite 数据层）
│   ├── server.js         # 入口：路由、中间件、凭据解析
│   ├── foods.js          # 食材 CRUD 与业务逻辑
│   ├── households.js     # 家庭与成员邀请
│   ├── agent.js          # 内置 AI 助手
│   ├── aiSettings.js     # API Key 加密存储
│   ├── mcp.js            # Streamable HTTP MCP 端点
│   └── ...               # activities / users / pairing / accessTokens 等
├── public/               # 前端 SPA（index.html + app.js + 样式）
├── test/                 # 单元测试（node --test）
├── config.example.json   # 配置模板（提交到仓库）
├── edgeone.json          # Makers 部署配置
└── package.json
```

> 注：`.edgeone/`、`cloud-functions/`、`config.json`、`data/` 等为构建产物或本地敏感文件，已加入 `.gitignore` 不随仓库提交。

---

## 二次开发指引

1. **本地改后端**：直接编辑 `src/`，`npm run dev` 热重载。
2. **改前端**：编辑 `public/app.js`、`public/styles.css` 等，刷新即可（无需打包）。
3. **加接口**：在 `src/server.js` 注册路由，业务下沉到 `src/*.js` 各模块。
4. **加测试**：在 `test/` 下新增 `*.test.js`，沿用现有 `helpers.js` 的测试夹具。
5. **换模型 / 接 MCP**：通过环境变量或 H5 内「系统 Agent / 我的 Agent」配置，无需改代码。

欢迎提交 Issue 与 Pull Request。

---

## 许可证

本项目采用 **MIT 许可证**：允许任何人自由使用、修改、分发（含商业用途），只需在副本中保留版权与许可声明。

完整条款见 `LICENSE` 文件。
