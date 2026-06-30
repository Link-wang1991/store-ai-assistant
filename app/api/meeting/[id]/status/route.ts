import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchTranscription } from "@/lib/ai/asr";
import { analyzeMeeting } from "@/lib/ai/meeting-analysis";

export const runtime = "nodejs";
export const maxDuration = 300; // 长会谈分析调用大模型耗时更久

// 轮询并推进会谈状态机：transcribing → analyzing → done。
// 幂等：重复调用（多页面/多次轮询）不会重复插入 transcript 或重复分析。
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const meeting: any = await db.meetings.getById(params.id, ctx.store.id);
  if (!meeting) return NextResponse.json({ error: "会谈不存在" }, { status: 404 });

  // 员工只能推进自己的；店长/老板可推进本店任意会谈
  const isMgr = ["owner", "manager"].includes(ctx.baseRole);
  if (meeting.employee_id !== ctx.employee.id && !isMgr)
    return NextResponse.json({ error: "无权查看" }, { status: 403 });

  const storeId = ctx.store.id;

  try {
    if (meeting.status === "done") return NextResponse.json({ status: "done" });
    if (meeting.status === "failed") return NextResponse.json({ status: "failed" });

    // ── 转写中：查 ASR 任务 ──
    if (meeting.status === "transcribing" && meeting.asr_task_id) {
      const r = await fetchTranscription(meeting.asr_task_id);
      if (r.status === "pending") return NextResponse.json({ status: "transcribing" });
      if (r.status === "failed") {
        await db.meetings.update(params.id, storeId, { status: "failed", transcript_status: "failed" });
        return NextResponse.json({ status: "failed", error: "转写失败" });
      }
      // ASR 成功但没识别到有效语音
      if (!r.segments.length) {
        await db.meetings.update(params.id, storeId, { status: "failed", transcript_status: "failed" });
        return NextResponse.json({ status: "failed", error: "未识别到有效语音（录音可能太短、太嘈杂或无人说话）" });
      }
      // 幂等：已有转写则不重复插入
      const existing = await db.meetingTranscripts.countByMeeting(params.id, storeId);
      if (existing === 0) {
        const rows = r.segments.map((s, i) => ({
          meeting_id: params.id,
          store_id: storeId,
          speaker: s.speaker,
          content: s.text,
          start_time: s.start,
          end_time: s.end,
          seq: i,
        }));
        await db.meetingTranscripts.insertMany(rows);
      }
      await db.meetings.update(params.id, storeId, { transcript_status: "done", status: "analyzing" });
      return NextResponse.json({ status: "analyzing" });
    }

    // ── 分析中：跑分析（幂等：已有报告则直接 done）──
    if (meeting.status === "analyzing") {
      const already = await db.meetingAnalysis.getByMeeting(params.id, storeId);
      if (already) {
        await db.meetings.update(params.id, storeId, { status: "done", analysis_status: "done" });
        return NextResponse.json({ status: "done" });
      }
      try {
        await analyzeMeeting(ctx, params.id);
        return NextResponse.json({ status: "done" });
      } catch (e: any) {
        await db.meetings.update(params.id, storeId, { status: "failed", analysis_status: "failed" });
        return NextResponse.json({ status: "failed", error: e.message || "分析失败" });
      }
    }

    return NextResponse.json({ status: meeting.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "状态查询失败" }, { status: 500 });
  }
}
