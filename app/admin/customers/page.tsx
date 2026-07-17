import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminCustomerManager } from "@/components/AdminCustomerManager";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  const ctx = (await getAuthContext())!;
  const [allCusts, emps] = await Promise.all([
    db.customers.listByStore(ctx.store.id) as Promise<any[]>,
    db.employees.listByStore(ctx.store.id) as Promise<any[]>,
  ]);
  const employees = (emps || []).filter((e) => e.status !== "disabled").map((e) => ({ id: e.id, name: e.name }));

  return (
    <AdminCustomerManager
      customers={allCusts}
      employees={employees}
    />
  );
}
