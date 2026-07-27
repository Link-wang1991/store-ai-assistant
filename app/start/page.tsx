import { StartClient } from "@/components/StartClient";
import { db } from "@/lib/db";
import { DEMO_ACCOUNT_TEMPLATES, type DemoAccountTemplate } from "@/lib/demo-accounts";
import { roleLabel } from "@/lib/roles";

export const dynamic = "force-dynamic";

type DemoAccount = {
  role: string;
  name: string;
  email: string;
  password: string;
  entry: string;
  purpose: string;
};

type DemoEmployee = {
  name?: string | null;
  role?: string | null;
  status?: string | null;
  store_id?: string | null;
};

const demoAccountTemplates: DemoAccountTemplate[] = DEMO_ACCOUNT_TEMPLATES;

function fallbackDemoAccounts(): DemoAccount[] {
  return demoAccountTemplates.map((account) => ({
    role: account.roleOverride || account.fallbackRole,
    name: account.name,
    email: account.email,
    password: account.password,
    entry: account.entry,
    purpose: account.purpose,
  }));
}

function employeeList(row: any): DemoEmployee[] {
  if (!row?.employees) return [];
  return Array.isArray(row.employees) ? row.employees : [row.employees];
}

async function getDemoAccounts(): Promise<DemoAccount[]> {
  const fallback = fallbackDemoAccounts();

  try {
    const rows = await db.startup.listDemoEmployees(demoAccountTemplates.map((account) => account.email));
    const employeesByEmail = new Map<string, DemoEmployee | "disabled">();
    for (const row of rows as any[]) {
      const employees = employeeList(row);
      const activeEmployee = employees.find((employee) => employee.status === "active");
      if (activeEmployee) {
        employeesByEmail.set(row.email, activeEmployee);
      } else if (employees.length > 0) {
        employeesByEmail.set(row.email, "disabled");
      }
    }

    const storeIds = Array.from(
      new Set(
        Array.from(employeesByEmail.values())
          .filter((employee): employee is DemoEmployee => employee !== "disabled")
          .map((employee) => employee.store_id)
          .filter((storeId): storeId is string => !!storeId)
      )
    );
    const labelPairs = await Promise.all(
      storeIds.map(async (storeId) => [storeId, await db.roles.labelMap(storeId)] as const)
    );
    const labelsByStore = new Map(labelPairs);

    return demoAccountTemplates.flatMap((account) => {
      const employee = employeesByEmail.get(account.email);
      if (employee === "disabled") return [];
      const labels = employee?.store_id ? labelsByStore.get(employee.store_id) : undefined;
      return [
        {
          role: employee ? roleLabel(employee.role || account.roleKey, labels) : account.roleOverride || account.fallbackRole,
          name: employee?.name || account.name,
          email: account.email,
          password: account.password,
          entry: account.entry,
          purpose: account.purpose,
        },
      ];
    });
  } catch {
    return fallback;
  }
}

async function getStartupStatus(demoEmails: string[]) {
  const aiProvider = process.env.AI_PROVIDER || "mock";
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

  // 检查后端是否在线
  let backendOk = false;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080"}/api-docs`, { signal: AbortSignal.timeout(3000) });
    backendOk = res.ok;
  } catch {}

  const status = [
    {
      label: "后端 API",
      value: backendOk ? "在线" : "离线",
      ok: backendOk,
      hint: backendOk ? "Spring Boot 后端正常运行" : "请执行 store-ai-server 启动步骤",
    },
    {
      label: "AI_PROVIDER",
      value: aiProvider,
      ok: ["mock", "deepseek", "qwen"].includes(aiProvider),
      hint: aiProvider === "mock" ? "当前使用 mock，可先跑通闭环" : "真实模型 key 只应放在 .env.local",
    },
    {
      label: "DeepSeek",
      value: process.env.DEEPSEEK_API_KEY ? "已配置" : "未配置",
      ok: aiProvider !== "deepseek" || !!process.env.DEEPSEEK_API_KEY,
      hint: "文本问答、话术、日报、员工分析",
    },
    {
      label: "Qwen",
      value: process.env.QWEN_API_KEY ? "已配置" : "未配置",
      ok: aiProvider !== "qwen" || !!process.env.QWEN_API_KEY,
      hint: "图片识别、语音转写（会谈复盘）、embedding 向量检索",
    },
    {
      label: "文件存储",
      value: (process.env.STORAGE_PROVIDER || "none") === "supabase" ? "已开启 · supabase" : "未开启",
      ok: true,
      hint: "知识库原件用公开桶；会谈录音用私有桶 meeting-audio（需 STORAGE_PROVIDER=supabase）",
    },
    {
      label: "Demo Mode",
      value: demoMode ? "已开启" : "已关闭",
      ok: demoMode,
      hint: "本地测试建议开启；真实客户环境设为 false",
    },
  ];

  try {
    const demo = await db.startup.getDemoStatus(demoEmails) as any;
    const activeStoreCount = Number(demo?.activeStoreCount);
    const demoAccountCount = Number(demo?.demoAccountCount);
    const canReadDemoStatus = Number.isFinite(activeStoreCount) && Number.isFinite(demoAccountCount);
    if (canReadDemoStatus) {
      status.push(
        {
          label: "门店数据",
          value: activeStoreCount > 0 ? `${activeStoreCount} 个演示门店` : "未创建演示数据",
          // 本地启动依赖的是 Spring Boot 后端；没有前端 demo 表不等于真实门店无法登录。
          ok: true,
          hint: activeStoreCount > 0 ? "仅用于本地测试" : "未配置本地演示数据，不影响已有真实账号登录",
        },
        {
          label: "演示账号",
          value: `${demoAccountCount}/${demoEmails.length}`,
          ok: Boolean(demo.demoAccountsReady),
          hint: demo.demoAccountsReady ? `${demoEmails.length} 个演示账号已可测试` : "测试账号未完整创建，请使用已有账号登录",
        }
      );
    } else {
      status.push({
        label: "前端演示数据",
        value: "未启用",
        ok: true,
        hint: "当前使用 Spring Boot 业务后端；客户、会谈和任务数据请在登录后查看，不会因此影响软件启动。",
      });
    }
    } catch (error: any) {
      status.push({
        label: "数据库连通",
        value: "异常",
        ok: false,
        hint: error?.message || "无法读取 Supabase，请检查 schema 和密钥",
      });
    }

  return { demoMode, status };
}

export default async function StartPage() {
  const accounts = await getDemoAccounts();
  const { demoMode, status } = await getStartupStatus(accounts.map((account) => account.email));

  return <StartClient demoMode={demoMode} accounts={accounts} status={status} />;
}
