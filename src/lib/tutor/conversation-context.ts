import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { estimateTokens } from "@/lib/ai/openai";

export const MAX_HISTORY_MESSAGES = Number(process.env.TUTOR_MAX_HISTORY_MESSAGES || "8");
export const MAX_HISTORY_TOKENS = Number(process.env.TUTOR_MAX_HISTORY_TOKENS || "900");

export type TutorHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  intent?: string | null;
};

export async function getConversationContext(input: {
  conversationId: string;
  userId: string;
  currentMessage: string;
}) {
  const { data, error } = await createSupabaseAdmin()
    .from("tutor_messages")
    .select("role,content,intent,created_at")
    .eq("conversation_id", input.conversationId)
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (error || !data) return { messages: [], summary: "", retrievalQuery: input.currentMessage };

  const messages = (data as TutorHistoryMessage[]).reverse();
  let tokens = 0;
  const selected: TutorHistoryMessage[] = [];
  for (const message of messages) {
    const estimated = estimateTokens(message.content);
    if (tokens + estimated > MAX_HISTORY_TOKENS) break;
    selected.push(message);
    tokens += estimated;
  }

  const summary = selected
    .slice(-6)
    .map((message) => {
      const content = message.content.length > 420 ? `${message.content.slice(0, 420)}...` : message.content;
      return `${message.role === "assistant" ? "Tutor" : "Estudiante"}: ${content}`;
    })
    .join("\n");

  const needsReference = /^(eso|esto|dame|expl[ií]camelo|explicame|no entend|otro ejemplo|cu[aá]les|preg[uú]ntame)/i.test(
    input.currentMessage.trim(),
  );
  const lastUser = selected
    .filter((message) => message.role === "user" && message.content.length > 12)
    .at(-1)?.content;
  const retrievalQuery = needsReference && lastUser ? `${lastUser}\n${input.currentMessage}` : input.currentMessage;

  return { messages: selected, summary, retrievalQuery };
}
