export const DEMO_PASSWORD = "demo123456";

export type DemoAccountTemplate = {
  roleKey: string;
  fallbackRole: string;
  roleOverride?: string;
  name: string;
  email: string;
  password: string;
  entry: string;
  purpose: string;
};

export const DEMO_ACCOUNT_TEMPLATES: DemoAccountTemplate[] = [
  {
    roleKey: "owner",
    fallbackRole: "管理员",
    roleOverride: "管理员",
    name: "系统管理员",
    email: "admin@demo.com",
    password: DEMO_PASSWORD,
    entry: "/admin",
    purpose: "演示超级管理员：登录后用右下角「切换角色」一键切到任意角色，无需重新登录",
  },
  {
    roleKey: "owner",
    fallbackRole: "老板",
    name: "王老板",
    email: "owner@demo.com",
    password: DEMO_PASSWORD,
    entry: "/admin",
    purpose: "门店 AI 经营大脑：今日 AI 工作台、客户机会池、会谈复盘、AI 教练、我的",
  },
  {
    roleKey: "manager",
    fallbackRole: "店长",
    name: "李店长",
    email: "manager@demo.com",
    password: DEMO_PASSWORD,
    entry: "/admin",
    purpose: "今日 AI 工作台 + 客户机会池：处理员工提交、分配增长动作、维护知识库",
  },
  {
    roleKey: "consultant",
    fallbackRole: "咨询师",
    name: "小美",
    email: "consultant@demo.com",
    password: DEMO_PASSWORD,
    entry: "/work",
    purpose: "今天该跟谁一目了然：客户机会池 + AI 教练话术 + 会谈复盘",
  },
  {
    roleKey: "beautician",
    fallbackRole: "美容师",
    name: "阿芳",
    email: "beautician@demo.com",
    password: DEMO_PASSWORD,
    entry: "/work",
    purpose: "今日工作台 + AI 教练：护理 SOP、服务前后注意、客户安抚、风险升级",
  },
  {
    roleKey: "receptionist",
    fallbackRole: "前台",
    name: "小婷",
    email: "reception@demo.com",
    password: DEMO_PASSWORD,
    entry: "/work",
    purpose: "今日工作台 + AI 教练：接待、活动说明、客户分流、改约话术",
  },
  {
    roleKey: "operator",
    fallbackRole: "运营",
    name: "阿杰",
    email: "operator@demo.com",
    password: DEMO_PASSWORD,
    entry: "/work",
    purpose: "AI 教练 + 知识库：朋友圈、小红书、团购文案与合规表达",
  },
  {
    roleKey: "skin_manager",
    fallbackRole: "皮肤管理师",
    name: "小遥",
    email: "skintest@demo.com",
    password: DEMO_PASSWORD,
    entry: "/work",
    purpose: "今日工作台 + 客户机会池：皮肤检测、护理建议、敏感风险提醒",
  },
];

export const DEMO_EMAILS = DEMO_ACCOUNT_TEMPLATES.map((account) => account.email);
