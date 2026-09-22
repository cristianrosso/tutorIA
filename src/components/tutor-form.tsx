"use client";

import { TutorChat } from "@/components/tutor/tutor-chat";

export function TutorForm({
  unit,
  initialConversationId,
  initialMessages,
}: {
  unit: { number: number; name: string };
  section?: string;
  initialConversationId?: string;
  initialMessages?: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    usage?: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCost: number;
    };
  }>;
}) {
  return (
    <TutorChat
      unit={unit}
      initialConversationId={initialConversationId}
      initialMessages={initialMessages}
    />
  );
}
