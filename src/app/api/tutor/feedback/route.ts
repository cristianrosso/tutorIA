import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const feedbackSchema = z.object({
  messageId: z.uuid(),
  rating: z.enum(["up", "down"]),
});

export async function POST(request: Request) {
  const profile = await requireStudent();
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Feedback inválido." }, { status: 400 });
  }

  const db = createSupabaseAdmin();
  const { data: message } = await db
    .from("tutor_messages")
    .select("id,user_id")
    .eq("id", parsed.data.messageId)
    .eq("user_id", profile.id)
    .single();
  if (!message) {
    return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });
  }

  const { error } = await db.from("tutor_message_feedback").upsert(
    {
      message_id: parsed.data.messageId,
      user_id: profile.id,
      rating: parsed.data.rating,
    },
    { onConflict: "message_id,user_id" },
  );
  if (error) {
    return NextResponse.json({ error: "No se pudo guardar el feedback." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
