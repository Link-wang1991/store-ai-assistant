# 门店 AI 经营助手

面向美容院 / 皮肤管理 / SPA / 轻医美门店的**私有化 AI 经营助手**。
基于每家门店自己的项目、话术、活动、SOP、岗位和管理标准，为不同角色员工提供工作指导，并让老板在后台管理员工、知识库、任务、风险与日报。

> 这不是通用聊天机器人，而是「门店经验沉淀系统 + 员工工作指导系统 + 老板管理复盘系统 + 风险控制系统」。

## 技术栈

- **Next.js 14**（App Router）+ TypeScript + Tailwind CSS
- **Spring Boot 3.3 + MySQL 8.4**（backend 模式）/ **Supabase (PostgreSQL)**（supabase 模式）
- **数据源**：`NEXT_PUBLIC_DATA_SOURCE=supabase|backend` 配置切换，`lib/db` 适配层透明切换
- **认证**：Spring Boot JWT（backend 模式）/ Supabase Auth（supabase 模式）
- **AI 适配层**：`mock / deepseek / qwen` 可切换（`AI_PROVIDER`）
- **AI 模型**：文字使用 DeepSeek V4 Pro，图片识别/语音使用千问 3.6 PLUS
- 手机网页 + PWA（可添加到手机桌面）

## 目录结构

```
app/
  login/                登录页
  chat/                 员工 AI 对话页（核心）
  tasks/ me/ submit/    员工：我的任务 / 我的 / 提交问题
  admin/                老板·店长后台（layout 做权限拦截 + 底部导航）
    page.tsx            经营驾驶舱（统计 / 风险 / 待确认）
    employees/          员工管理
    knowledge/          知识库（列表 / 上传 / 缺口 / 标准答案 / 禁用词）
    tasks/ reports/     任务管理 / 经营报告
  api/chat/             聊天接口（问答流程入口）
lib/
  ai/                   适配层 provider / 分类 classify / prompt / pipeline 主流程
  knowledge/            文件解析 parse / 切分 chunk / 检索 retrieve
  actions.ts            所有后台写操作（Server Actions，统一权限校验）
  auth.ts supabase/     登录态 + 三类 Supabase 客户端
supabase/schema.sql     数据库结构（整段执行）
scripts/seed.mjs        演示数据初始化
```

## 架构：可替换适配层 + 双数据源切换

页面 / 组件**不直接接触数据库**，所有外部依赖都收敛在适配层，通过 `NEXT_PUBLIC_DATA_SOURCE` 切换：

- **supabase 模式**：`lib/db` 走 Supabase（PostgreSQL + Auth + 向量检索），部署至 Vercel
- **backend 模式**：`lib/db` 走 Spring Boot ProxyController（`lib/db/backend-impl.ts` 自动切换），MySQL 8.4

| 目录 | 职责 | 迁移做法 |
|---|---|---|
| `lib/auth` | 登录态、账号创建、浏览器登录/登出 | 换认证服务时改 `provider.ts` / `client.ts`，`getAuthContext()` 签名不变 |
| `lib/db` | 所有领域数据访问（语义化方法） | `lib/db/index.ts` 根据 `DATA_SOURCE` 自动选择 `supabase-impl` 或 `backend-impl`（ProxyController HTTP 调用） |
| `lib/storage` | 知识库原始文件存储 | 实现同样的 `storage.saveOriginal()` 即可（默认 `none` 不依赖存储桶） |
| `lib/ai` | 模型调用 + 问答流程 | `AI_PROVIDER` 切换，或在 `provider.ts` 加新厂商 |

底层的 `lib/supabase/*` 是唯一直接 new Supabase 客户端的地方。
> 校验：`grep -rl "@supabase" app components lib` 只会命中 `lib/auth`、`lib/db`、`lib/storage`、`lib/supabase`。

## 本地运行（5 步）

### 1. 安装依赖
```bash
npm install
```

### 2. 创建 Supabase 项目并执行建表
1. 到 https://supabase.com 新建一个项目。
2. 打开 **SQL Editor**，把 `supabase/schema.sql` 全部内容粘贴进去执行。

### 3. 配置环境变量
复制 `.env.local.example` 为 `.env.local`，填入 Supabase 的 URL 和密钥
（在 Supabase → Project Settings → API 获取）：
```bash
cp .env.local.example .env.local
```
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
AI_PROVIDER=mock        # 先用 mock，全流程可跑通
```

### 4. 初始化演示数据（可选但推荐）
```bash
node --env-file=.env.local scripts/seed.mjs
```
会创建一个演示门店 + 6 个角色账号 + 示例知识库。账号：
| 角色 | 邮箱 | 密码 |
|---|---|---|
| 老板 | owner@demo.com | demo123456 |
| 店长 | manager@demo.com | demo123456 |
| 咨询师 | consultant@demo.com | demo123456 |
| 美容师 | beautician@demo.com | demo123456 |
| 前台 | reception@demo.com | demo123456 |
| 运营 | operator@demo.com | demo123456 |

### 5. 启动
```bash
npm run dev
```
打开 http://localhost:3000 。手机访问局域网 IP，浏览器「添加到主屏幕」即可像 App 一样使用。

## 切换真实 AI 模型

在 `.env.local` 中修改：
```
AI_PROVIDER=deepseek        # 或 openai / claude
DEEPSEEK_API_KEY=sk-xxx     # 填对应 provider 的 key
# AI_MODEL=deepseek-chat    # 可选，覆盖默认模型
```
未配置对应 key 时会自动回退到 `mock`，不影响使用。

## 核心机制

- **角色化回答**：同一问题，咨询师看话术、美容师看 SOP、运营看文案、老板看经营，由角色 prompt 决定。
- **知识隔离**：员工提问只检索「同门店 + 自己角色可见 + 启用中」的知识片段，不同门店、不同角色互不可见。
- **风险分级**（L1–L4）：高风险（皮肤异常/医疗/投诉）自动拦截并升级、进风险记录；价格/退款/活动叠加等自动转「待确认」；知识库无答案自动记「知识库缺口」。
- **合规**：内置 + 门店自定义禁用词，回答命中自动提醒规避。

## 部署到 Vercel

1. 推到 GitHub。
2. Vercel 导入项目，配置与 `.env.local` 相同的环境变量。
3. Deploy。（Supabase 已是云端，无需额外操作）

## 开发阶段对照（产品说明书第十三章）

- **V1（当前）**：登录、角色权限、员工对话、知识库上传/列表/检索、问题分类、风险等级、知识库缺口、待确认问题、风险记录、老板后台、提问记录。
- **V2**：任务管理、活动管理、老板日报、员工能力画像、标准答案审核、快捷模板、店长工作台、禁用词、运营提交审核。（任务/日报/标准答案/禁用词已具备）
- **V3**：客户跟进、复购、活动复盘、业绩分析、月报、AI 演练、向量检索、图片 OCR、多门店连锁总后台。
```
