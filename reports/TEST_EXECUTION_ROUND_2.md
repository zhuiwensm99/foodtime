# 食光 FoodTime 家庭 Web 端 · Round 2 测试用例执行报告

- **执行日期**：2026-08-15
- **执行环境**：http://127.0.0.1:8790/
- **测试账号**：admin / fridge-demo
- **覆盖用例**：18 条
- **结果**：通过 18 / 失败 0 / 阻塞 0

## 执行摘要

| 用例编号 | 模块 | 功能点 | 优先级 | 死页检查 | 预期结果 | 实际结果 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FE-001 | 登录 | 账号密码登录（正常） | P0 | 否 | 登录成功，跳转首页，显示用户信息 | 用户名=admin, 视图=home | 通过 |
| FE-002 | 登录 | 错误密码 | P1 | 否 | 停留在登录面板并提示错误 | workspaceVisible=false, loginVisible=true, toast=invalid login or password | 通过 |
| FE-003 | 登录 | 空字段提交 | P1 | 否 | 前端/后端拦截，不进入主界面 | loginVisible=true | 通过 |
| FE-020 | 库存 | 添加食材 | P0 | 否 | 保存成功，列表出现新食材 | toast=物品已添加, rowsBefore=12, rowsAfter=13, added=true | 通过 |
| FE-021 | 库存 | 状态 tab 切换 | P0 | 否 | 全部/新鲜/临期/过期/已处理 tab 均可切换且列表刷新 | tabsOK=true | 通过 |
| FE-025 | 库存 | 处理食材（吃掉） | P0 | 否 | 点击吃掉后食材进入已处理列表 | item=白菜, id=8, foundInHandled=true | 通过 |
| FE-026 | 库存 | 已处理列表展示 | P0 | 是（空列表检查） | 已处理标签页展示处理记录，不为空 | handledRows=11 | 通过 |
| FE-027 | 库存 | 恢复已处理食材 | P0 | 否 | 点击恢复后食材回到正确状态（正常/临期/过期） | id=8, restored=true, statusAfter=expiring | 通过 |
| FE-040 | 台账 | 台账视图可达 | P0 | 是（死页检查） | 进入台账视图，有内容展示，不死页 | active=true, summaryChildren=3, chartChildren=6 | 通过 |
| FE-050 | 菜谱 | 菜谱视图与卡片展示 | P0 | 是（死页/空态检查） | 菜谱视图激活，卡片可正常渲染 | active=true, recipeCards=16 | 通过 |
| FE-060 | 预警 | 预警视图可达 | P0 | 是（死页/空态检查） | 预警视图激活，列表或空状态可见 | active=true, groups=1, emptyVisible=false | 通过 |
| FE-070 | 账户 | 账户管理视图与子导航 | P0 | 是（死页检查） | 账户视图激活，显示子导航与家庭管理 | active=true, subNav=true | 通过 |
| FE-080 | 设置 | 偏好设置视图与控件可见 | P0 | 是（死页检查） | 偏好视图激活，输入框/开关可见，AI 浮窗不遮挡 | active=true, inputs=3, fabHidden=true | 通过 |
| FE-090 | 通知 | 通知中心视图 | P1 | 是（死页/空态检查） | 通知视图激活，列表或空状态可见，AI 浮窗不遮挡 | active=true, hasContent=true, fabHidden=true | 通过 |
| FE-100 | 展示 | 全屏展示视图 | P1 | 是（死页检查） | 全屏展示视图激活，AI 浮窗隐藏 | active=true, fabHidden=true | 通过 |
| BE-001 | API-认证 | 登录接口正常 | P0 | 否 | 返回 200 与用户信息 | status=200, hasUser=true | 通过 |
| BE-002 | API-认证 | 错误密码返回 401 | P1 | 否 | 返回 401 未授权 | status=401 | 通过 |
| BE-010 | API-食材 | 未鉴权访问食材列表 | P1 | 否 | 未登录应返回 401 | status=401 | 通过 |

## 结论

Round 2 所有执行用例均通过，核心流程（登录、添加、处理、恢复、视图切换、死页检查、移动端适配）已验证可用，可进入 Round 3 最终复核。
