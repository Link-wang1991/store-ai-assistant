// ============================================================
// 全局常量：角色、权限、知识库分类、问题分类、风险等级、禁用词、快捷问题
// 这些是产品说明书第六、八、九章定义的核心枚举，集中维护
// ============================================================

// ---------- 角色 ----------
export const ROLES = [
  "owner",
  "manager",
  "consultant",
  "beautician",
  "receptionist",
  "operator",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "老板",
  manager: "店长",
  consultant: "咨询师",
  beautician: "美容师",
  receptionist: "前台",
  operator: "运营",
};

// 后台管理角色（老板端/店长端可进入）
export const ADMIN_ROLES: Role[] = ["owner", "manager"];

export function isAdminRole(role?: string | null): boolean {
  return !!role && ADMIN_ROLES.includes(role as Role);
}

// 可上传知识库的角色（产品说明书 8.4）
export const KNOWLEDGE_UPLOAD_ROLES: Role[] = ["owner", "manager"];

export function canUploadKnowledge(role?: string | null): boolean {
  return !!role && KNOWLEDGE_UPLOAD_ROLES.includes(role as Role);
}

// ---------- 知识库分类（产品说明书 8.1 / 十九章）----------
export const KNOWLEDGE_CATEGORIES = [
  "品牌介绍",
  "门店定位",
  "项目介绍",
  "价格表",
  "活动方案",
  "销售话术",
  "客户异议处理",
  "护理流程",
  "服务流程",
  "售后SOP",
  "客诉处理",
  "员工培训",
  "岗位职责",
  "禁用词",
  "合规规则",
  "优秀案例",
  "常见问题",
  "朋友圈文案",
  "小红书文案",
  "团购资料",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

// ---------- 问题分类（产品说明书 9.1）----------
export const QUESTION_CATEGORIES = [
  "项目介绍",
  "销售话术",
  "活动政策",
  "护理流程",
  "客户跟进",
  "客诉处理",
  "医美健康异常",
  "员工管理",
  "经营数据",
  "运营文案",
  "合规表达",
  "其他问题",
] as const;

export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

// ---------- 风险等级（产品说明书 9.2）----------
export type RiskLevel = "L1" | "L2" | "L3" | "L4";

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  L1: "知识库有明确答案",
  L2: "无明确答案，给通用建议",
  L3: "需店长/老板确认",
  L4: "高风险，需立即升级",
};

export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  L1: "bg-emerald-100 text-emerald-700",
  L2: "bg-sky-100 text-sky-700",
  L3: "bg-amber-100 text-amber-700",
  L4: "bg-red-100 text-red-700",
};

// 回答类型
export type AnswerType = "knowledge" | "general" | "need_confirm" | "risk";

// ---------- 任务类型 / 状态（产品说明书 10.7）----------
export const TASK_TYPES = [
  "客户跟进",
  "活动执行",
  "员工培训",
  "老客唤醒",
  "朋友圈发布",
  "客诉处理",
  "服务复盘",
  "知识库补充",
] as const;

export const TASK_STATUSES = [
  "todo",
  "doing",
  "done",
  "overdue",
  "canceled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "待开始",
  doing: "进行中",
  done: "已完成",
  overdue: "已逾期",
  canceled: "已取消",
};

// ---------- 默认禁用词（产品说明书 8.10 / 12.1）----------
export const DEFAULT_BANNED_WORDS = [
  "根治",
  "永久",
  "保证有效",
  "一次见效",
  "排毒",
  "包治",
  "无风险",
  "绝对安全",
  "一定有效",
  "彻底治愈",
  "百分百",
  "最好",
  "最佳",
  "国家级",
  "医院级",
];

// ---------- 快捷问题模板（产品说明书 7.4）----------
export const QUICK_QUESTIONS: Partial<Record<Role, string[]>> = {
  consultant: [
    "客户嫌贵怎么回？",
    "客户说考虑一下怎么回？",
    "客户不回微信怎么办？",
    "客户问有没有效果怎么回？",
    "客户对比别家怎么回？",
    "帮我生成客户跟进话术",
    "帮我介绍某个项目",
    "帮我判断这个客户适合哪个项目",
  ],
  beautician: [
    "这个项目标准流程是什么？",
    "服务前需要提醒客户什么？",
    "服务后注意事项怎么说？",
    "客户反馈泛红怎么处理？",
    "客户不舒服怎么安抚？",
    "什么时候需要升级给店长？",
  ],
  receptionist: [
    "新客户进店怎么接待？",
    "客户问活动怎么介绍？",
    "客户迟到怎么处理？",
    "客户改约怎么回复？",
    "客户只问价格怎么引导？",
  ],
  operator: [
    "帮我写朋友圈文案",
    "帮我写小红书标题",
    "帮我优化团购标题",
    "帮我写活动海报文案",
    "帮我检查是否有违规词",
  ],
  manager: [
    "今天员工都问了什么？",
    "本月活动怎么给员工拆解任务？",
    "帮我生成晨会培训建议",
  ],
  owner: [
    "今天门店经营状态怎么样？",
    "员工能力短板在哪？",
    "本月活动目标怎么定？",
  ],
};

// ---------- 权限矩阵（产品说明书一）----------
export const PERMISSION_MODULES = [
  { key: "workbench", label: "工作台" },
  { key: "customers", label: "客户/咨询记录" },
  { key: "followups", label: "回访任务" },
  { key: "schedules", label: "排班" },
  { key: "campaigns", label: "活动" },
  { key: "projects", label: "项目/套餐" },
  { key: "knowledge", label: "知识库" },
  { key: "risks", label: "风险记录" },
  { key: "reports", label: "经营报告" },
  { key: "employees", label: "员工管理" },
  { key: "permissions", label: "权限管理" },
] as const;

export const PERMISSION_ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "assign",
  "review",
  "export",
  "handle_risk",
] as const;

export const DATA_SCOPES = [
  { key: "self", label: "只看自己" },
  { key: "assigned", label: "分配给我的" },
  { key: "role", label: "本岗位" },
  { key: "store", label: "本门店" },
  { key: "all", label: "全量" },
] as const;

// 通知类型
export const ANNOUNCEMENT_TYPES = [
  { key: "training", label: "培训" },
  { key: "campaign", label: "活动" },
  { key: "schedule", label: "排班" },
  { key: "policy", label: "制度" },
  { key: "urgent", label: "紧急" },
  { key: "general", label: "一般" },
] as const;
