// ============================================================
// 门店自定义配置：默认类别与默认项（code + 显示名）。
// 门店未自定义某类时用这里的默认；自定义后以 store_config 表为准。
// ============================================================

export interface ConfigItem {
  code: string;
  name: string;
  enabled: boolean;
  visibleToStaff: boolean;
}

export interface ConfigCategory {
  key: string;
  label: string;
  items: [string, string][];
}

export const CONFIG_CATEGORIES: ConfigCategory[] = [
  { key: "role", label: "岗位名称", items: [["owner", "老板"], ["manager", "店长"], ["consultant", "咨询师"], ["beautician", "美容师"], ["receptionist", "前台"]] },
  { key: "duty", label: "岗位职责", items: [["sales", "成交转化"], ["service", "服务交付"], ["reception", "接待登记"], ["retention", "老客维护"]] },
  { key: "workbench", label: "工作台模板", items: [["consultant_board", "咨询师工作台"], ["beautician_board", "美容师工作台"], ["reception_board", "前台工作台"]] },
  { key: "knowledge", label: "知识库分类", items: [["project", "项目资料"], ["campaign", "活动资料"], ["sop", "服务SOP"], ["script", "销售话术"], ["complaint", "客诉处理"], ["banned", "禁用词"], ["training", "员工培训"], ["retention", "老客维护规则"]] },
  { key: "pool", label: "客户池名称", items: [["today", "今日到店"], ["new", "新客"], ["new_deal", "新成交"], ["regular", "老客"], ["dormant", "沉睡"], ["risk", "风险"]] },
  { key: "stage", label: "客户阶段", items: [["new", "新客咨询"], ["intent", "意向"], ["deal", "已成交"], ["regular", "老客"], ["churn_risk", "流失风险"]] },
  { key: "alert", label: "预警规则名称", items: [["churn", "流失预警"], ["service", "服务风险预警"], ["nofollow", "超时未跟进"], ["complaint", "投诉升级"]] },
  { key: "followup", label: "跟进动作名称", items: [["new_24h", "新客24h回访"], ["unclosed_3d", "未成交3天"], ["dormant_30d", "老客30天唤醒"], ["after_service", "服务后回访"]] },
  { key: "scene", label: "会谈场景名称", items: [["new_consult", "新客咨询"], ["project_intro", "项目介绍"], ["deal_consult", "成交沟通"], ["price_objection", "价格异议"], ["effect_doubt", "效果疑虑"], ["complaint", "客户投诉"]] },
  { key: "tag", label: "客户标签", items: [["price_sensitive", "价格敏感"], ["effect_focus", "重效果"], ["referral", "转介绍"], ["vip", "高价值"]] },
  { key: "project_cat", label: "项目分类", items: [["skin", "皮肤项目"], ["body", "身体项目"], ["private", "私密项目"], ["device", "仪器操作"]] },
  { key: "sop_cat", label: "服务SOP分类", items: [["before", "术前"], ["during", "术中"], ["after", "术后护理"]] },
  { key: "script_cat", label: "话术分类", items: [["price", "价格异议"], ["effect", "效果疑虑"], ["compare", "对比同行"], ["closing", "促单"]] },
];

// /me 管理设置里的 hash 别名 → 类别 key
export const CONFIG_HASH_ALIAS: Record<string, string> = { lifecycle: "stage" };

// 组装初始数据：库里有某类记录则用库（已自定义），否则用默认项
export function buildInitialConfig(saved: any[]): Record<string, ConfigItem[]> {
  const byCat: Record<string, ConfigItem[]> = {};
  for (const r of saved || []) {
    (byCat[r.category] = byCat[r.category] || []).push({
      code: r.code,
      name: r.display_name,
      enabled: r.enabled,
      visibleToStaff: r.visible_to_staff,
    });
  }
  const result: Record<string, ConfigItem[]> = {};
  for (const c of CONFIG_CATEGORIES) {
    result[c.key] = byCat[c.key]
      ? byCat[c.key]
      : c.items.map(([code, name]) => ({ code, name, enabled: true, visibleToStaff: true }));
  }
  return result;
}
