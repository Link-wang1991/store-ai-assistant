import { CustomerProfileApiFallback } from "@/components/CustomerProfileApiFallback";

export const dynamic = "force-dynamic";

/**
 * The customer workbench and this profile use the same live API record.
 * Keeping the route client-backed avoids the older server adapter resolving a
 * valid customer-list item to a false 404 while the auth middleware continues
 * to protect the page.
 */
export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerProfileApiFallback customerId={id} />;
}
