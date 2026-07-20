# 门店 AI 助手｜Stitch 交付与实现映射

更新时间：2026-07-17  
Stitch 项目：`projects/7401080187027553783`（UI Specification Prototype Design）  
主设计系统：`assets/7d8dff7bcde34d36ab0b161ca169c366`（Pure White AI Assistant）

## 目的

这份文件是 Stitch 设计稿与 Next.js 实现之间的交接基线。它不替代产品需求文档；实现前仍以 `docs/门店AI助手前端产品需求文档.md` 和 `docs/AI教练功能业务闭环.md` 为业务事实来源。

## 已有主稿与代码入口

| 产品区域 | Stitch 主稿 | 当前实现入口 | 对齐重点 |
| --- | --- | --- | --- |
| 首页 AI Inbox | `6b5689217dd343ffaa635cf19760cb55`（标准规范版）；`e4e2fa6be9174017813d54d2b2653a13`（业务闭环增强版） | `app/home/page.tsx`、`components/HomePage.tsx` | 今日摘要、按经营价值排序的 AI 工作项、单一主动作 |
| 会谈与录音 | `090e09bdccc04218933e99d58aa50957` | `app/meeting/page.tsx`、`components/MeetingClient.tsx` | 客户唯一识别、场景选择、录音同意、处理状态 |
| 会谈异常与恢复 | `39e7006fc48c431b8b15d70e59140d3b`（本轮新增） | `app/meeting/[id]/page.tsx` | 重试转写、录音保留、手动补充、降级跟进、可信度 |
| 客户详情 | `b2f8ab258f5b4c169562a0e44cb11bf1` | `app/customers/[id]/page.tsx` | 身份、事实/AI 记忆分层、行动与时间线 |
| AI 教练 | `d084418f88904cb9b74b9db603723300`（标准）；`603f4a49ac654730be70ab88152d8a01`（深度闭环） | `app/chat/page.tsx`、`components/CoachLanding.tsx`、`components/ChatClient.tsx` | 客户/通用模式、可直接说的话、行动卡、依据折叠 |
| 管理中心 | `5251e45f79714c15bf7a398b7da95b07` | `app/admin/page.tsx` 及 `app/admin/*` | 风险、知识缺口、未完成动作优先 |

## 会谈失败状态：实现验收清单

新状态稿只定义界面和交互表达；以下项目必须由实际产品能力支撑，不能只做静态按钮。

- [x] 后端已阻止未获得客户同意的录音创建：`app/api/meeting/route.ts`。
- [x] 会谈详情已有处理失败状态与“重新提交转写”服务端动作：`app/meeting/[id]/page.tsx`、`lib/actions.ts`。
- [ ] 失败详情显示录音是否已安全保存、时长、失败原因与最后保存时间。
- [ ] 失败详情提供“手动补充记录”并写入当前会谈，而不是跳回无上下文页面。
- [ ] 失败详情能从当前客户/会谈创建带默认 3 天期限的回访任务。
- [ ] 失败详情显示信息类型、来源、更新时间、待确认状态，并能提交店长确认。
- [ ] 所有异常状态按钮具备真实结果反馈、加载态和失败重试；未开放能力必须明确标为未开放。

## 设计令牌（实现侧）

| 设计语义 | 现有 CSS 变量 / 约束 |
| --- | --- |
| 页面与卡片 | `--page`、白色卡片、`--line` 细边框 |
| AI / 主操作 / 完成 | `--green`、`--green-dark`、`--green-soft` |
| 待处理 / 风险 | `--yellow` / `--red`；风险不得使用大面积红底 |
| 结构 | 4px 间距基线、移动端 16px 页面边距、主要点击目标至少 44px |
| 信息层级 | 动作 → AI 判断 → 可用话术 → 风险/升级 → 折叠依据 |

## 工作流

1. 先在 Stitch 主项目中基于 `Pure White AI Assistant` 设计系统创建或修改状态稿。
2. 将对应的 screen ID 登记到本文档，再把交互拆成 API、组件和验收项。
3. 只在已有后端能力支撑时落地可点击主动作；否则以明确的待开放状态呈现。
4. 本地实现后，运行 `npm run build`，并在 375px、390px、430px 宽度下检查底部导航、长内容与触控目标。

