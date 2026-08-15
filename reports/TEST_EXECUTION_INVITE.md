
## 邀请闭环回归

| 编号 | 模块 | 用例 | 优先级 | 必测 | 期望 | 实际 | 结果 |
| INV-01 | 账户 | 生成邀请码+复制入口 | P0 | 否 | 邀请码显示、面板可见、两个复制按钮存在 | code=YHKQHU5P4E, panelVisible=true, copyCode=true, copyLink=true | 通过 |
| INV-01b | 账户 | 邀请链接含邀请码 | P1 | 否 | inviteUrl 形如 .../?invite=CODE | url=http://127.0.0.1:8790/?invite=YXWQJWM6VR | 通过 |
| INV-02 | 注册 | 邀请链接自动回填 | P0 | 否 | 注册表单可见且邀请码已填入 | regVisible=true, prefilled=YXWQJWM6VR | 通过 |
| INV-03 | 注册 | 用邀请码注册加入家庭 | P0 | 否 | 注册成功进入工作台，且新成员出现在 admin 家庭 | joined=true, memberCount=5, hasNew=true | 通过 |
| INV-04 | 注册 | 已用邀请码再次使用被拒 | P1 | 否 | 返回错误（已使用） | status=410, code=invite_used | 通过 |
| INV-05 | 注册 | 无效邀请码被拒 | P1 | 否 | 返回错误（无效） | status=404, code=invite_not_found | 通过 |
| INV-06 | 账户 | 复制邀请码按钮可用 | P2 | 否 | 点击后给出复制反馈（toast 出现） | toast=家庭邀请已生成 | 通过 |

**汇总：通过 7，失败 0，阻塞 0**
