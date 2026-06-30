import { DEFAULT_BANNED_WORDS } from "../constants";

// ============================================================
// 对客话术合规清洗
// 增长机会卡的 opening 会被员工直接拿去对客，必须比主回答更保守。
// 策略：先保守化高频承诺词，再整句剔除"承诺式/疗效绝对化"句式，最后删残留禁用词。
// ============================================================

// 1) 保守化替换：承诺词 → 审慎说法（能救则救）
const SOFTEN: [RegExp, string][] = [
  [/明显(改善|提升|改变|变化|淡化|美白|嫩肤)/g, "帮助$1"],
  [/明显(见效|有效果|效果)/g, "逐步感受变化"],
  [/(根治|彻底治愈|彻底解决|彻底去除|彻底祛除)/g, "改善"],
  [/永久(保持|维持)?/g, "较长期"],
  [/(包治|保证有效|一定有效|确保有效)/g, "因人而异、需坚持"],
];

// 2) 整句剔除：命中这些"承诺式/绝对化"句式的整句直接删（宁可少说，不留对客风险）
const PROMISE_RE: RegExp[] = [
  /(做|用|来|体验)?(一|1|几|两)次(就|便|即|后)?(能|可|会|让|看到|见到|见效|有效果|变|白|嫩|改善)/,
  /(立刻|马上|立即|立竿见影|当天|当场|很快)(就)?(能|可)?(见效|看到效果|变白|变嫩|有效果)/,
  /效果(好不好|怎么样|如何)?[，,]?\s*(自己)?(看得见|能看到|立见|立竿见影)/,
  /(一定|肯定|保证|绝对|百分百|100%|包您|包你)/,
  /无(任何)?(风险|副作用|刺激)/,
  /(做完|用完|几次)(就|后)?(变白|变嫩|年轻|去除|消除|没有)/,
];

export function sanitizeScript(input: string | null | undefined): { text: string; changed: boolean } {
  if (!input) return { text: "", changed: false };
  const original = input;

  let text = input;
  for (const [re, to] of SOFTEN) text = text.replace(re, to);

  // 按句切分（保留标点），剔除命中强承诺句式的整句
  const parts = text.split(/([。！？!?\n；;])/);
  const kept: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const seg = (parts[i] || "") + (parts[i + 1] || "");
    if (!seg.trim()) continue;
    if (PROMISE_RE.some((re) => re.test(seg))) continue;
    kept.push(seg);
  }
  let cleaned = kept.join("").trim();

  // 残留禁用词直接删除
  for (const w of DEFAULT_BANNED_WORDS) {
    if (w && cleaned.includes(w)) cleaned = cleaned.split(w).join("");
  }
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

  return { text: cleaned, changed: cleaned !== original };
}
