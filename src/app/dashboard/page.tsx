import { AppShell } from "@/components/app-shell";
import { StudentDashboard } from "@/components/student-dashboard";
import { requireStudent } from "@/lib/auth/session";
import { getStudentStats } from "@/lib/data";

export default async function DashboardPage() {
  const profile = await requireStudent();
  const stats = await getStudentStats();
  return (
    <AppShell profile={profile} active="home">
      <StudentDashboard profile={profile} stats={stats} />
    </AppShell>
  );
}
