import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { retrieveAcademicContext } from "@/lib/knowledge/rag";

const searchSchema = z.object({
  query: z.string().trim().min(3).max(500),
  unitNumber: z.number().int().min(1).max(15).optional(),
  debug: z.boolean().optional(),
});

export async function POST(request: Request) {
  await requireAdmin();
  const parsed = searchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Consulta inválida para diagnóstico RAG." },
      { status: 400 },
    );
  try {
    const result = await retrieveAcademicContext(parsed.data.query, {
      unitNumber: parsed.data.unitNumber,
      debug: parsed.data.debug,
      maxChunks: 8,
      maxContextTokens: 2200,
    });
    return NextResponse.json({
      query: parsed.data.query,
      intent: result.queryAnalysis.intent,
      queryAnalysis: result.queryAnalysis,
      results: result.sources.map((source) => ({
        chunkId: source.chunkId,
        knowledgeObjectId: source.knowledgeObjectId,
        title: source.title,
        unitNumber: source.unitNumber,
        unitName: source.unitName,
        topicName: source.topicName,
        sectionName: source.sectionName,
        sourceReference: source.sourceReference,
        semanticScore: source.semanticScore,
        lexicalScore: source.lexicalScore,
        academicScore: source.academicScore,
        finalScore: source.finalScore,
        contentPreview: source.sourceText.slice(0, 700),
      })),
      sources: result.sources,
      contextPreview: result.context.slice(0, 4000),
      diagnostics: result.diagnostics,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo ejecutar la búsqueda académica.",
      },
      { status: 500 },
    );
  }
}
