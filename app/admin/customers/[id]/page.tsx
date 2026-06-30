import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// 客户详情已统一到 /customers/[id]（员工/老板共用的 AI 客户画像）
export default function LegacyCustomerDetail({ params }: { params: { id: string } }) {
  redirect(`/customers/${params.id}`);
}
