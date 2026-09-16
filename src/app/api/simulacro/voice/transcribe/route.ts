import { NextResponse } from "next/server";
import { accessProblem } from "@/lib/auth/rules";
import { getCurrentProfile } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { estimateAudioInputCost } from "@/lib/ai/costs";
import { transcribeAudio } from "@/lib/ai/openai";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "ESTUDIANTE" || accessProblem(profile))
      return fail(
        "Inicia sesión como estudiante para responder el simulacro.",
        401,
      );
    if (!(await consumeLimit(`simulation-stt:${profile.id}`, 8, 60)))
      return fail("Espera un minuto antes de enviar más audios.", 429);
    const form = await request.formData();
    const audio = form.get("audio");
    const simulationId = form.get("simulationId");
    const duration = Math.max(
      0,
      Math.min(90, Number(form.get("duration")) || 0),
    );
    if (!(audio instanceof File)) return fail("No se recibió audio.");
    if (audio.size < 250)
      return fail(
        `El audio llegó vacío o incompleto (${audio.size} bytes). Revisa el permiso del micrófono e intenta otra vez.`,
      );
    if (typeof simulationId !== "string" || !simulationId)
      return fail("No se encontró el simulacro activo.");
    const transcription = await transcribeAudio({ audio, language: "es" });
    await createSupabaseAdmin()
      .from("usage_events")
      .insert({
        user_id: profile.id,
        simulation_id: simulationId,
        provider: "openai",
        model: transcription.model,
        event_type: "stt",
        input_tokens: transcription.inputTokens,
        output_tokens: transcription.outputTokens,
        audio_input: duration,
        audio_output: 0,
        estimated_cost: estimateAudioInputCost(duration),
        provider_request_id: transcription.requestId,
      });
    return NextResponse.json({
      transcript: transcription.text,
      model: transcription.model,
      audioInputSeconds: duration,
    });
  } catch {
    return fail(
      "No se pudo transcribir tu respuesta. Puedes escribirla manualmente.",
      500,
    );
  }
}
