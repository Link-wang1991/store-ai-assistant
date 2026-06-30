# 门店专属 AI 经营大脑 —— 验收与上线迁移 Checklist

> 版本：截至 2026-06-07。本文件只做整理/核对/验收，不含新功能。
> 产品定位：不是 SaaS 管理后台，而是「门店专属 AI 经营大脑」——越用越懂客户、越用越懂这家店，帮老板和员工抓成交/复购/服务机会。

---

## 1. 已完成功能清单（按模块）

### 老板端 `/admin` 今日增长作战室
- 今日增长 StatCard（高意向 / 待唤醒老客 / 待跟进）
- **🎯 今天最该抓的机会**：按业务价值+紧急度+逾期智能排序，取 top5，展示 7 要素「可执行成交/复购卡」
- 今日待跟进客户（followups）、客户体验风险（risk_logs）、员工卡点（高频问题）、当前主推活动
- 管理设置入口下沉为底部小图标（客户/增长动作/复盘/知识库/通知/员工/权限/提问记录）
- 入口受权限守卫（仅 owner/manager 或显式全店权限角色，见 §7）

### 员工端 `/work` 今日成交与服务助手
- 按 base_role 分流 4 种工作台：咨询师 / 美容师 / 前台 / 通用
- **🎯 我今天最该跟进**：三端都接入，展示分配给本人的机会卡（问 AI / 完成 / 忽略）
- 咨询师：我的客户分层、待回访、新建回访、记录反馈
- 美容师：排班、活动讲解口径、项目 SOP 问 AI、上报客户异常
- 前台：接待话术、分流判断、活动可说版本、异常登记
- AI 成交/服务教练快捷入口

### 客户经营 `/admin/customers`
- 客户分层概览（新客/意向/成交/老客/流失风险）
- 客户列表 + 一键「AI 建议」
- 自动建档（员工新建回访 / 记录反馈时）

### 客户详情页 `/admin/customers/[id]`
- 🤖 AI 跟进建议（写回 ai_suggestion）
- 🧠 AI 记住的要点（memory_items 客户记忆）
- 🌱 增长机会（该客户的机会卡）
- 👤 客户画像编辑（10+ 画像字段）
- ➕ 记录互动 + 🕑 互动时间线

### AI 教练 `/chat`
- 角色化 8 段结构化回答（客户判断/沟通策略/话术/追问/下一步/风险/是否升级/是否补标签）
- 支持 `?customerId=` 带客户画像、`?q=` 预填问题
- 识图入口（见多模态）

### 知识库 `/admin/knowledge`
- 文档上传（docx/pdf/txt 等解析 → 分块）、列表、启停、删除
- 标准答案、禁用词、知识库缺口（一线高频未答问题自动累计）
- 上传时自动生成 embedding（语义检索）

### 系统增长方法论库 `growth_playbooks`
- 60 条系统级方法论（销售成交/消费心理/客户分型/服务体验/老客复购/活动转化等）
- 检索：语义向量优先，回退 bigram；按 base_role 过滤

### 长记忆 `memory_items`
- **客户级**（scope=customer）：AI 对话后自动抽取客户事实（决策链/顾虑/预算/偏好/禁忌），带置信度
- **门店级**（scope=store）：机会完成时提炼「本店已验证经验」，注入所有 AI 回答

### 增长机会 `growth_opportunities`
- AI 旁路自动产出 + 客户档案 next_follow_at 自动生成
- 8 类来源（new_lead/trial_unclosed/dormant/vip_care/campaign_fit/post_service/recovery/followup）
- 7 要素卡（客户/状态/为什么值得跟/阻碍/话术/下一步目标/跟进人）
- opening 话术写入前合规清洗
- 完成时触发门店级经验沉淀

### 互动留痕 `customer_interactions`
- AI 建议自动留痕（kind=ai_suggestion）+ 手动记录互动（跟进/微信/电话/到店/反馈）

### 识图 / 多模态
- 图片识别（Qwen Vision）：客户聊天截图/活动海报/点评截图/反馈图
- 皮肤/术后/红肿等风险图：只辅助整理，不做医疗诊断，提示升级
- 语音 / 视频：仅预留接口，未实现

### 权限 / 角色
- 内置角色 owner/manager/consultant/beautician/receptionist + 门店自定义角色（role_definitions，按 base_role 继承工作台与权限）
- 权限矩阵 role_permissions（模块 × 动作 × 数据范围）
- /admin 入口边界已收紧（见 §7）

### 报告 / 增长复盘 `/admin/reports`
- 一键生成「经营日报」（AI 生成 10 段经营视角叙述，底层聚合客户/回访/反馈/风险/缺口/通知数据）
- 历史日报列表
- ⚠️ 尚未融合三阶段新数据（长记忆/机会/画像变化），仍偏「当日统计 + AI 叙述」（见 §7）

---

## 2. Migration 文件清单

| 文件 | 作用 |
|---|---|
| `schema.sql` | 基础 17 表：stores/users/employees/roles/knowledge_documents/knowledge_chunks/chat_sessions/chat_messages/pending_questions/knowledge_gaps/risk_logs/tasks/reports/activity_logs/banned_words/standard_answers/activities |
| `migration-v2.sql` | 经营底座 10 表：role_definitions/role_permissions/announcements/schedules/campaigns/service_projects/customer_records/consultation_records/followups/customer_feedback + RLS |
| `migration-v3.sql` | 放开 employees.role 固定枚举约束，支持门店自定义角色 |
| `migration-v4.sql` | growth_playbooks（系统方法论）+ 预留 customer_interactions / memory_items / growth_opportunities |
| `migration-v5.sql` | customer_records 深化画像字段（personality/decision_style/concerns/next_follow_at/ai_suggestion 等）+ interactions/memory 索引与唯一约束 |
| `migration-v6.sql` | memory_items 加 confidence/source/updated_at + updated_at 触发器（长记忆自动沉淀底座） |
| `migration-v7.sql` | growth_opportunities 加 source/updated_at + 触发器 + 客户维度索引（机会引擎） |
| `migration-v8.sql` | 启用 pgvector；knowledge_chunks/growth_playbooks 加 vector(1024) + HNSW 索引 + 两个检索 RPC 函数（语义检索） |
| `migration-v9.sql` | growth_opportunities 加 reason/blocker/opening/goal（机会卡 7 要素业务字段） |

> 门店级长记忆（store scope）**无独立 migration**，复用 memory_items（v4 建表 + v6 字段）。

### A. 全新数据库部署（按顺序全部执行）
```
schema.sql → v2 → v3 → v4 → v5 → v6 → v7 → v8 → v9
```
（v3 依赖 v2；v5 依赖 v4；v6 依赖 v4/v5；v7 依赖 v4；v9 依赖 v4/v7。务必按编号顺序。）

### B. 已有本地库升级
- 只需补执行**本地库尚未跑过的最新几个**。本项目当前进度：v6 / v7 / v8 / v9 已在你的库执行。
- 判断方法：查列是否存在，例如
  ```sql
  select column_name from information_schema.columns
  where table_name='growth_opportunities' and column_name in ('source','reason','opening');
  ```
  缺哪个补哪个 migration。全部幂等，重复执行安全。

---

## 3. 脚本清单

| 脚本 | 作用 | 何时执行 | 成功判断 |
|---|---|---|---|
| `scripts/seed.mjs` | 演示门店 + 6 角色账号 + 示例知识库 + 禁用词 | 全新部署初始化演示环境 | 控制台无报错，能用 owner@demo.com / demo123456 登录 |
| `scripts/seed-v2.mjs` | 默认角色定义/权限矩阵 + 示例通知/排班/活动/项目 | 执行 v2 migration 后 | 角色权限可在 /admin/roles 看到；幂等 |
| `scripts/seed-playbooks.mjs` | 60 条系统增长方法论（store_id=null 全局） | 执行 v4 migration 后 | growth_playbooks 有 60 条 active |
| `scripts/backfill-embeddings.ts` | 给存量 knowledge_chunks / growth_playbooks 回填向量 | 执行 v8 + 配好 QWEN_API_KEY 后 | 输出「回填成功 N/N」，跳过/失败为 0 |
| `scripts/test-customer-fusion.ts` | 端到端自测：画像融合 + AI 建议写回 + 互动留痕 + 记忆沉淀 + 机会产出 | 联调验证用（结束自清理，不污染库） | 各项 ✅，机会卡含 7 要素 |
| `scripts/cleanup-test-data.ts` | 一次性清理重复测试客户 + 空字段机会卡 | 需要清污染时 | 输出清理条数；复跑显示 0 |

执行示例：
```
node --env-file=.env.local scripts/seed.mjs
node --env-file=.env.local scripts/seed-v2.mjs
node --env-file=.env.local scripts/seed-playbooks.mjs
npx tsx --env-file=.env.local scripts/backfill-embeddings.ts
```

---

## 4. 环境变量清单（仅变量名与用途，不含密钥）

### Supabase
| 变量 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址（客户端可见） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 匿名 key（客户端登录态） |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端数据访问（lib/db / 脚本，绕过 RLS） |
| `SUPABASE_STORAGE_BUCKET` | 文件存储桶名（知识库原件 / 图片） |
| `STORAGE_PROVIDER` | 存储适配层选择（none / supabase） |

### AI Provider 选择
| 变量 | 用途 |
|---|---|
| `AI_PROVIDER` | `mock`（默认）/ `deepseek` / `qwen`，决定文本问答走哪家；未配 key 自动回退 mock |

### DeepSeek
| 变量 | 用途 |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek key |
| `DEEPSEEK_BASE_URL` | 接口地址（默认 api.deepseek.com） |
| `DEEPSEEK_MODEL` | 文本模型（默认 deepseek-chat） |

### Qwen / 通义（文本 + 多模态 + Embedding）
| 变量 | 用途 |
|---|---|
| `QWEN_API_KEY` | 通义 key（DashScope） |
| `QWEN_BASE_URL` | 兼容模式地址 |
| `QWEN_TEXT_MODEL` | 文本模型 |
| `QWEN_VISION_MODEL` | 图片识别模型 |
| `QWEN_EMBED_MODEL` | 向量模型（默认 text-embedding-v3，1024 维） |
| `QWEN_AUDIO_MODEL` | 语音模型（**预留，未实现**） |

### 其他
| 变量 | 用途 |
|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | 演示模式开关（前端引导/演示账号提示） |
| `NEXT_PUBLIC_APP_NAME` | 应用名 |
| `CRON_SECRET` | 定时日报接口 `/api/cron/daily-report` 鉴权 |

> Embedding 维度（1024）必须与 migration-v8 的 `vector(1024)` 一致；换模型/维度需同步改 SQL 并重新回填。

---

## 5. 能力真实性分级

### ✅ 真实可用（不依赖外部大模型）
- 登录/角色/权限、知识库上传解析分块、客户建档/画像/互动留痕、机会卡展示与完成/忽略、bigram 关键词检索、禁用词拦截、风险/待确认/缺口落库、作战室与工作台展示

### 🔑 依赖 API key 才可用
- AI 8 段问答、客户记忆自动抽取、画像/标签自动回写、增长机会 AI 产出、门店级经验提炼、经营日报生成 → 需 `DEEPSEEK_API_KEY` 或 `QWEN_API_KEY`
- 语义/向量检索 → 需 `QWEN_API_KEY`（embedding）+ 已执行 v8 + 已回填
- 图片识别 → 需 `QWEN_API_KEY`（Vision）

### 🧪 mock 模式可用（无 key 也能跑通流程）
- 全链路可在 `AI_PROVIDER=mock` 下跑通（回答走本地模板，记忆/机会抽取会自动跳过）

### 🧩 仅预留接口
- 语音识别 `callQwenAudio`（抛「暂未开放」）、视频

### ⚠️ 未真正闭环
- 经营日报未融合长记忆/机会/画像变化（仍偏当日统计 + AI 叙述）

---

## 6. 各模块完成度 + 验证方式 + 遗留问题

| 模块 | 已完成 | 可验证方式 | 遗留问题 |
|---|---|---|---|
| 老板端 /admin | 智能排序机会卡 + 风险/卡点/活动 | 登录 owner 看作战室「今天最该抓的机会」 | 日报未融合新数据 |
| 员工端 /work | 三端「我今天最该跟进」机会卡 | 登录咨询师看机会卡，点完成/问AI | 美容师/前台机会来源较少（多绑咨询师） |
| 客户经营 | 分层/列表/AI建议/自动建档 | /admin/customers 看分层与列表 | — |
| 客户详情 | AI建议+记忆+机会+画像+时间线 | 打开某客户看 5 个卡片 | — |
| AI 教练 /chat | 8 段结构 + 画像/记忆/方法论/店经验融合 | 带 customerId 提问看针对性 | 依赖 key |
| 知识库 | 上传/检索/缺口/标准答案/禁用词 | 上传文档→问相关问题命中 | — |
| 客户长记忆 | 自动抽取+画像回写+标签 | 跑 test-customer-fusion 看 memory_items | — |
| 门店长记忆 | 机会完成→提炼→注入回答 | 完成机会后新问题看「本店验证做法」 | — |

---

## 7. 风险与未完成项

| 项 | 状态 |
|---|---|
| 普通员工进入 /admin 权限边界 | ✅ **已修**：canEnterAdmin 仅 owner/manager 或显式 reports/customers 全店(view, scope=store/all)权限；不走 base_role 兜底。⚠️ 副作用：被显式配权限但 scope=self 的自定义角色会被挡，按需调其 scope |
| 机会卡话术合规过滤 | ✅ **已修**：opening 写入前 sanitizeScript 清洗（剔除承诺式/绝对化），prompt 也加强；机会卡话术比主回答更保守 |
| 测试客户重复污染 | ✅ **已修**：test 脚本结束自清理；cleanup 脚本已清掉历史 8 个重复客户 |
| 旧空字段机会卡 | ✅ **已清**：cleanup 脚本已处理 |
| 报告页/复盘仍偏统计 | ⚠️ **未做**：经营日报是 AI 叙述但底层为当日统计，未融合长记忆/机会/画像变化（建议后续升级为「经营洞察」） |
| 演示数据与真实数据混杂 | ⚠️ **注意**：seed.mjs 会建演示门店/账号（owner@demo.com 等）。正式上线门店前应清理演示数据或用独立环境 |
| migration 执行顺序风险 | ⚠️ **注意**：必须按 schema→v2→…→v9 顺序；有依赖（v3 依赖 v2、v5/v6/v7/v9 依赖 v4）。全部幂等可重复 |
| 迁移阿里云/腾讯云前注意 | 见下 |

### 迁移到阿里云 / 腾讯云注意事项
- **数据库**：用云 RDS PostgreSQL，需确认支持 `pgvector` 扩展（阿里云 RDS PG / 腾讯云 TencentDB PG 均支持，需在控制台启用）。RLS、触发器、RPC 函数都是标准 PG 特性可迁移。
- **适配层已隔离**（迁移只改这几处，页面/组件不直连）：
  - `lib/auth`（登录态/账号）→ Supabase Auth 换成自建/云鉴权
  - `lib/db`（数据访问）→ service_role 客户端换成云 PG 连接
  - `lib/storage`（文件）→ 换成 OSS / COS
  - `lib/ai`（模型）→ 已用国内 deepseek/qwen，无需换
- **service_role 概念**：当前 lib/db 用 Supabase service_role 绕过 RLS；迁到自建 PG 需改为受信连接 + 在应用层保证 store 隔离。
- **embedding 一致性**：换库后需重新执行 v8 等价 DDL + 重新回填向量。

---

## 8. 最小验收流程（一条完整路径）

> 前置：已执行 schema→v9 全部 migration、seed/seed-v2/seed-playbooks、backfill-embeddings；配好 `AI_PROVIDER=deepseek`（或 qwen）+ key。

1. **启动**：`npm run dev`（或 `npm run build` 验证构建通过）
2. **登录老板**：owner@demo.com / demo123456
3. **看 /admin 作战室**：确认「🎯 今天最该抓的机会」展示 7 要素卡 + 风险/卡点/活动
4. **登录咨询师**（另一演示账号）：进 /work
5. **看「🎯 我今天最该跟进」**：确认机会卡可见，「问 AI / 完成 / 忽略」可点
6. **打开客户详情**：/admin/customers → 某客户，确认 AI建议/记忆要点/机会/画像/时间线五卡
7. **问 AI**：客户页点「让 AI 分析」或 /chat 带 customerId 提问，看 8 段结构化回答
8. **验证 ai_suggestion 写回**：客户页「AI 跟进建议」出现内容
9. **验证 customer_interactions 留痕**：客户页时间线出现「🤖 AI建议」
10. **验证 memory_items 沉淀**：客户页「🧠 AI 记住的要点」出现 key=value
11. **验证 growth_opportunities 生成**：客户页/作战室出现机会卡
12. **验证门店级记忆**：把某机会标「完成」→ 用新问题问 AI → 回答体现「本店验证做法」
13. **验证 build**：`npm run build` 通过（29 路由）

> 快捷自测：`npx tsx --env-file=.env.local scripts/test-customer-fusion.ts` 一次性覆盖 7~11 步并自清理。

---

## 9. 待修复 / 待确认问题清单（暂停新功能，仅登记）

### 9.1 上线前必须确认

| 优先级 | 问题 | 说明 | 建议动作 |
|---|---|---|---|
| 高 | AI Provider / key 静默失效 | `AI_PROVIDER=mock` 或 key 未配/失效时，记忆抽取、机会产出、门店经验沉淀会自动跳过；页面可能不明显报错，老板会误以为「AI 经营大脑已经在跑」。 | 上线 checklist 必查 `/start` 状态；生产环境禁止默认 mock；核心 AI 调用失败时要有明确后台提示或日志。 |
| 高 | 演示数据与真实门店混库 | `seed.mjs` 会创建 `owner@demo.com` 等演示门店/账号。真实经营前如果不隔离，作战室、客户、机会、日报可能混入演示数据。 | 真实上线必须使用独立生产库，或先执行演示数据清理并记录清理结果。 |
| 高 | 跨门店隔离依赖应用层过滤 | 当前 `lib/db` 使用 service_role 绕过 RLS，门店隔离完全依赖每个查询都带 `store_id` 条件；新增查询漏过滤会跨店泄露数据。 | 单店私有化可接受；多店/云化前必须做 store_id 查询审计，最好补应用层统一数据访问封装或启用生产级 RLS/租户隔离。 |

### 9.2 试点前建议修复

| 优先级 | 问题 | 说明 | 建议动作 |
|---|---|---|---|
| 中 | AI 自动沉淀的记忆缺少管理入口 | 客户级记忆在客户详情页可看，但不能改/删；门店级经验没有专门 UI。若 AI 沉淀出不准经验，会持续影响后续回答，老板也不易发现。 | 后续补「门店记忆管理」页，至少支持查看、停用/删除、来源追溯；客户详情页支持删除明显错误记忆。 |
| 中 | 客户记忆注入无上限 | `buildCustomerProfile` 会把客户全部 `memory_items` 拼进 prompt；老客户互动多后 prompt 变长，成本和回答漂移风险上升。 | 给客户记忆加 top-N / 最近 N 条 / 置信度过滤；门店级记忆也要有数量上限。 |
| 中 | 每次员工提问成本偏高 | 一次员工提问可能包含 embedding 检索 + 主回答 + 记忆/机会抽取，且串行执行；高频使用时成本和响应时间会上升。 | 将记忆/机会抽取改成异步队列或降频；先保障主回答速度。 |
| 中 | 机会去重非原子 | `upsertOpen` 是先查后写，并发时同一客户同类机会理论上可能重复。 | 低并发试点可接受；正式多员工使用前建议加唯一索引或数据库级 upsert。 |
| 中 | 经营日报未融合三阶段新数据 | `report.ts` 仍是阶段一统计口径，未充分融合长记忆、机会变化、画像变化、今日阻碍。 | 后续升级为「经营洞察」：今日机会进展、客户阻碍、员工卡点、门店经验沉淀、明日优先动作。 |

### 9.3 后续优化，不阻塞试点

| 优先级 | 问题 | 说明 | 建议动作 |
|---|---|---|---|
| 低 | 美容师/前台机会来源偏少 | 机会多绑定产出员工（常为咨询师），美容师/前台机会主要来自服务补救场景。 | 试点观察真实工作流后再扩展，不要先做复杂任务系统。 |
| 低 | 语音/视频多模态 | 仅预留接口，未实现。 | 当前产品重点不是语音/视频，等图片闭环和经营闭环稳定后再做。 |

> 本阶段建议：不要继续开发新模块。先按 §8 做一轮老板端 / 员工端 / 客户详情 / AI 教练 / 长记忆 / 机会卡的真实验收；只修复「上线前必须确认」和试点中暴露的阻断问题。
