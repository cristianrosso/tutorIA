import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { generateSpeechAudio } from "@/lib/voice/text-to-speech";
import { recordAIUsage } from "@/lib/billing/ai-usage";

const schema = z.object({ text: z.string().trim().min(5).max(2200) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await requireStudent();
    const { id } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: "No hay texto válido para reproducir." },
        { status: 400 },
      );
    const speech = await generateSpeechAudio({
      text: parsed.data.text,
      style: "tutor",
    });
    await recordAIUsage({
      userId: profile.id,
      operationId: `guided-class-tts:${id}:${Buffer.from(parsed.data.text).toString("base64url").slice(0, 32)}`,
      operationType: "tts",
      model: speech.model,
      inputTokens: speech.inputTokens,
      outputTokens: speech.outputTokens,
      otherBillableUnits: {
        audioOutputSeconds: speech.audioOutputSeconds,
        feature: "guided_class",
      },
      estimatedCostUsd: speech.estimatedCost,
      costIsEstimated: true,
    });
    return new Response(speech.audio, {
      headers: {
        "Content-Type": speech.contentType,
        "Cache-Control": "private, max-age=900",
        "X-Audio-Seconds": String(speech.audioOutputSeconds),
        "X-OpenAI-Model": speech.model,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo generar el audio.",
      },
      { status: 500 },
    );
  }
}
