import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import {
  durationFromForm,
  transcribeStudentAudio,
} from "@/lib/voice/speech-to-text";
import { recordAIUsage } from "@/lib/billing/ai-usage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await requireStudent();
    const { id } = await params;
    const form = await request.formData();
    const audio = form.get("audio");
    const duration = durationFromForm(form.get("duration"));
    if (!(audio instanceof File))
      return NextResponse.json(
        { error: "No se recibió audio." },
        { status: 400 },
      );
    const transcription = await transcribeStudentAudio({
      audio,
      durationSeconds: duration,
      language: "es",
    });
    await recordAIUsage({
      userId: profile.id,
      operationId: `guided-class-stt:${id}:${transcription.requestId || crypto.randomUUID()}`,
      operationType: "stt",
      model: transcription.model,
      inputTokens: transcription.inputTokens,
      outputTokens: transcription.outputTokens,
      otherBillableUnits: {
        audioInputSeconds: transcription.audioInputSeconds,
        feature: "guided_class",
      },
      estimatedCostUsd: transcription.estimatedCost,
      costIsEstimated: true,
    });
    return NextResponse.json({
      transcript: transcription.transcript,
      model: transcription.model,
      audioInputSeconds: transcription.audioInputSeconds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo transcribir el audio.",
      },
      { status: 500 },
    );
  }
}
