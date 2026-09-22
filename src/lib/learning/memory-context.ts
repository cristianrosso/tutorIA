import "server-only";
import { estimateTokens } from "@/lib/ai/openai";
import { getCurrentLearningContext } from "@/lib/learning/academic-memory";

const MAX_MEMORY_CONTEXT_TOKENS = Number(process.env.MEMORY_CONTEXT_MAX_TOKENS || "420");

export async function buildStudentMemoryContext(input: {
  userId: string;
  currentQuery: string;
  conversationId?: string | null;
}) {
  const memory = await getCurrentLearningContext(input.userId);
  const topic = Array.isArray(memory.profile?.academic_topics)
    ? memory.profile?.academic_topics[0]
    : memory.profile?.academic_topics;
  const unit = Array.isArray(memory.profile?.academic_units)
    ? memory.profile?.academic_units[0]
    : memory.profile?.academic_units;

  const lines = ["CONTEXTO ACADÉMICO DEL ESTUDIANTE", "Esta memoria es dato verificable, no es fuente oficial del compendio."];
  if (unit?.unit_name) lines.push(`Última unidad estudiada: Unidad ${unit.unit_number} - ${unit.unit_name}.`);
  if (topic?.topic_name) lines.push(`Último tema trabajado: ${topic.topic_name}.`);
  if (memory.profile?.last_studied_at) lines.push(`Última actividad registrada: ${memory.profile.last_studied_at}.`);
  if (memory.recent.length) {
    lines.push("Temas recientes:");
    for (const row of memory.recent.slice(0, 3)) {
      const recentTopic = Array.isArray(row.academic_topics) ? row.academic_topics[0] : row.academic_topics;
      const recentUnit = Array.isArray(row.academic_units) ? row.academic_units[0] : row.academic_units;
      lines.push(`- ${recentTopic?.topic_name || row.metadata?.topicName || "Tema registrado"}${recentUnit?.unit_number ? ` (Unidad ${recentUnit.unit_number})` : ""}`);
    }
  }
  if (memory.review.length) {
    lines.push("Temas con evidencia de repaso necesario:");
    for (const row of memory.review.slice(0, 3)) {
      const reviewTopic = Array.isArray(row.academic_topics) ? row.academic_topics[0] : row.academic_topics;
      lines.push(`- ${reviewTopic?.topic_name || row.knowledge_object_id || "Tema registrado"}`);
    }
  } else {
    lines.push("Dificultades: sin evidencia suficiente registrada.");
  }
  lines.push("FIN DEL CONTEXTO ACADÉMICO DEL ESTUDIANTE");

  let context = lines.join("\n");
  while (estimateTokens(context) > MAX_MEMORY_CONTEXT_TOKENS && lines.length > 4) {
    lines.splice(-3, 1);
    context = lines.join("\n");
  }
  return context;
}
