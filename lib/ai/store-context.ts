import { db } from "../db";
import type { AuthContext } from "../types";

// ============================================================
// 业务数据上下文：员工问排班/通知/活动/项目时，把门店真实数据喂给 AI。
// 让 AI 回答「明天几点上班」「今天有什么培训」「最近活动注意什么」时有依据。
// ============================================================

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export async function buildStoreContext(ctx: AuthContext, question: string): Promise<string> {
  const q = question;
  const storeId = ctx.store.id;
  const employeeId = ctx.employee.id;
  const role = ctx.employee.role;

  const now = new Date();
  const tmr = new Date(Date.now() + 86400000);
  const parts: string[] = [
    `【时间】今天 ${fmtDate(now)}（${WEEKDAYS[now.getDay()]}），明天 ${fmtDate(tmr)}`,
  ];

  // 排班
  if (/排班|上班|几点|班次|休息|早班|晚班|值班|轮班|上几天/.test(q)) {
    const to = new Date(Date.now() + 7 * 86400000);
    const sch = await db.schedules.forEmployeeRange(storeId, employeeId, fmtDate(now), fmtDate(to));
    parts.push(
      sch.length
        ? "【我的排班·未来7天】\n" +
            sch
              .map((s: any) => `${s.work_date} ${s.shift_label || ""} ${s.start_time || ""}-${s.end_time || ""}`.trim())
              .join("\n")
        : "【我的排班】系统暂无你的排班数据，请提醒店长录入。"
    );
  }

  // 通知 / 重要事项 / 培训
  if (/通知|重要事项|培训|今天有|明天有|最近|安排|开会|晨会|要注意|事项/.test(q)) {
    const anns = await db.announcements.listVisible(
      storeId,
      Array.from(new Set([role, ctx.baseRole])),
      employeeId
    );
    if (anns.length) {
      parts.push(
        "【当前通知/重要事项】\n" +
          anns
            .map((a: any) => {
              const when = a.start_at ? `（${a.start_at.slice(0, 16).replace("T", " ")} 起）` : "";
              return `[${a.announcement_type}] ${a.title}${a.content ? "：" + a.content : ""}${when}`;
            })
            .join("\n")
      );
    }
  }

  // 活动
  if (/活动|优惠|促销|套餐|团购|主推|这个月|本月/.test(q)) {
    const camps = await db.campaigns.listActive(storeId);
    if (camps.length) {
      parts.push(
        "【在售活动】\n" +
          camps
            .map(
              (c: any) =>
                `${c.name}｜主推:${c.main_projects || "-"}｜价格:${c.price || "-"}｜员工口径:${c.staff_script || "-"}｜禁止表达:${c.banned_expr || "-"}`
            )
            .join("\n")
      );
    }
  }

  // 项目 / 价格 / 功效
  if (/项目|价格|多少钱|功效|适合|疗程|套餐|做什么|几次/.test(q)) {
    const projs = await db.projects.listActive(storeId);
    if (projs.length) {
      parts.push(
        "【门店项目】\n" +
          projs
            .map(
              (p: any) =>
                `${p.name}｜价格:${p.price || "-"}｜功效:${p.efficacy || "-"}｜适合:${p.suitable || "-"}｜禁忌:${p.contraindication || "-"}`
            )
            .join("\n")
      );
    }
  }

  // 只有"时间"一段说明没命中任何业务数据，返回空避免噪音
  return parts.length > 1 ? parts.join("\n\n") : "";
}
