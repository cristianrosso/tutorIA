import { NextResponse } from "next/server";
import { z } from "zod";
import { accessProblem } from "@/lib/auth/rules";
import { getCurrentProfile } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { estimateAudioOutputCost, estimateSpeechSeconds } from "@/lib/ai/costs";
import { synthesizeSpeech } from "@/lib/ai/openai";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const speechSchema = z.object({
  simulationId: z.string().uuid(),
  questionId: z.string().uuid(),
  text: z.string().trim().min(10).max(1200),
});

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "ESTUDIANTE" || accessProblem(profile))
      return fail("Inicia sesión como estudiante para usar el simulacro.", 401);
    if (!(await consumeLimit(`simulation-tts:${profile.id}`, 12, 60)))
      return fail("Espera un minuto antes de generar más audios.", 429);
    const parsed = speechSchema.safeParse(await request.json());
    if (!parsed.success) return fail("No se recibió una pregunta válida.");

    const db = createSupabaseAdmin();
    const { data: simulation, error } = await db
      .from("simulations")
      .select("id,session_id")
      .eq("id", parsed.data.simulationId)
      .eq("user_id", profile.id)
      .single();
    if (error || !simulation) return fail("No se encontró el simulacro.", 404);

    const speech = await synthesizeSpeech({ text: parsed.data.text });
    const outputSeconds = estimateSpeechSeconds(parsed.data.text);
    await db.from("usage_events").insert({
      user_id: profile.id,
      session_id: simulation.session_id,
      simulation_id: parsed.data.simulationId,
      provider: "openai",
      model: speech.model,
      event_type: "tts",
      input_tokens: speech.inputTokens,
      output_tokens: speech.outputTokens,
      audio_input: 0,
      audio_output: outputSeconds,
      estimated_cost: estimateAudioOutputCost(outputSeconds),
      provider_request_id: speech.requestId,
    });
    return new Response(speech.audio, {
      headers: {
        "Content-Type": speech.contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Audio-Seconds": String(outputSeconds),
        "X-OpenAI-Model": speech.model,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && /OPENAI_API_KEY/.test(error.message)
        ? "La clave de OpenAI no está configurada en el servidor."
        : "No se pudo generar el audio de la pregunta. Puedes leerla en pantalla.";
    return fail(message, 500);
  }
}
