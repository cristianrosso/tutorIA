import { BookOpen } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TutorForm } from "@/components/tutor-form";
import { StudentCourseSwitcher } from "@/components/student-course-switcher";
import { requireStudent } from "@/lib/auth/session";
import { getUnitByNumber } from "@/lib/data";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStudentProductContext } from "@/lib/products/selection";

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; section?: string; conversation?: string; product?: string }>;
}) {
  const profile = await requireStudent();
  const params = await searchParams;
  const unitNumber = Math.min(99, Math.max(1, Number(params.unit) || 1));
  const productContext = await getStudentProductContext(profile, params.product);
  const unit = await getUnitByNumber(unitNumber, productContext.activeProduct.id);
  const section = params.section?.slice(0, 180);
  const initialMessages = params.conversation
    ? await readInitialMessages(params.conversation, profile.id)
    : [];
  return (
    <AppShell profile={profile} active="tutor">
      <StudentCourseSwitcher
        products={productContext.products}
        activeProduct={productContext.activeProduct}
        basePath={`/tutor?unit=${unitNumber}`}
      />
      <div className="page-heading">
        <div>
          <span className="eyebrow">TUTOR IA · RAG POR UNIDAD</span>
          <h1>
            Tutor IA<span className="heading-dot">.</span>
          </h1>
          <p>
            Pregunta sobre Unidad {unit.number}, {unit.name}, dentro del curso {productContext.activeProduct.short_name}. El tutor filtra el
            compendio por curso, unidad y tema seleccionado.
          </p>
        </div>
        <span className="badge">
          <BookOpen size={15} /> Unidad {unit.number}
        </span>
      </div>
      <TutorForm
        unit={unit}
        section={section}
        initialConversationId={params.conversation}
        initialMessages={initialMessages}
        productId={productContext.activeProduct.id}
        productSlug={productContext.activeProduct.slug}
      />
    </AppShell>
  );
}

async function readInitialMessages(conversationId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return [];
  const { data } = await createSupabaseAdmin()
    .from("tutor_messages")
    .select("id,role,content,model_used,input_tokens,output_tokens")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(30);
  return (data || []).map((message) => ({
    id: message.id as string,
    role: message.role as "user" | "assistant",
    content: message.content as string,
    usage: message.model_used
      ? {
          model: message.model_used as string,
          inputTokens: Number(message.input_tokens || 0),
          outputTokens: Number(message.output_tokens || 0),
          estimatedCost: 0,
        }
      : undefined,
  }));
}
