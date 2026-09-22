import { AppShell } from "@/components/app-shell";
import { GuidedClassPanel } from "@/components/classroom/guided-class-panel";
import { requireStudent } from "@/lib/auth/session";
import { getClassroomCatalog } from "@/lib/classroom/guided-class-service";

export default async function GuidedClassPage() {
  const profile = await requireStudent();
  const catalog = await getClassroomCatalog();

  return (
    <AppShell profile={profile} active="classroom">
      <section className="hero compact-hero">
        <div>
          <span className="eyebrow">Aprendizaje guiado</span>
          <h1>Modo Clase.</h1>
          <p>
            Desarrolla una unidad o tema por etapas, con explicación, ejemplos,
            preguntas de comprobación y retroalimentación.
          </p>
        </div>
      </section>
      <GuidedClassPanel units={catalog.units} topics={catalog.topics} />
    </AppShell>
  );
}
