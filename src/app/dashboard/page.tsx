import { AppShell } from "@/components/app-shell";
import { StudentDashboard } from "@/components/student-dashboard";
import { requireStudent } from "@/lib/auth/session";
import { getStudentStats } from "@/lib/data";
import { getStudentProductContext } from "@/lib/products/selection";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const profile = await requireStudent();
  const params = await searchParams;
  const [stats, productContext] = await Promise.all([
    getStudentStats(),
    getStudentProductContext(profile, params.product),
  ]);
  return (
    <AppShell profile={profile} active="home">
      <StudentDashboard
        profile={profile}
        stats={stats}
        products={productContext.products}
        activeProduct={productContext.activeProduct}
      />
    </AppShell>
  );
}
