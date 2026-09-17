"use client";
import { useState, type FormEvent } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

type SearchResult = {
  chunkId: string;
  knowledgeObjectId: string | null;
  title: string | null;
  unitNumber: number | null;
  unitName: string | null;
  topicName: string | null;
  sectionName: string | null;
  sourceReference: string | null;
  semanticScore: number;
  lexicalScore: number;
  academicScore: number;
  finalScore: number;
  contentPreview: string;
};

type SearchResponse = {
  query: string;
  intent: string;
  results: SearchResult[];
  contextPreview: string;
  diagnostics: { embeddingMs: number; searchMs: number; rerankMs: number; totalMs: number; debug?: unknown };
  error?: string;
};

export function KnowledgeSearchPanel() {
  const [query, setQuery] = useState("¿Qué es liderazgo?");
  const [unitNumber, setUnitNumber] = useState(12);
  const [debug, setDebug] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, unitNumber, debug }),
      });
      setResult((await response.json()) as SearchResponse);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="knowledge-search-panel">
      <form className="admin-form" onSubmit={submit}>
        <label>
          Pregunta de diagnóstico
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={3}
            maxLength={500}
          />
        </label>
        <div className="form-grid compact">
          <label>
            Unidad preferida
            <select
              value={unitNumber}
              onChange={(event) => setUnitNumber(Number(event.target.value))}
            >
              {Array.from({ length: 15 }, (_, index) => index + 1).map((n) => (
                <option key={n} value={n}>
                  Unidad {n}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={debug}
              onChange={(event) => setDebug(event.target.checked)}
            />
            Mostrar debug RAG
          </label>
        </div>
        <button className="button primary" disabled={loading || query.trim().length < 3}>
          <Search size={16} /> {loading ? "Buscando…" : "Buscar contexto"}
        </button>
      </form>

      {result?.error && <p className="notice error">{result.error}</p>}
      {result && !result.error && (
        <section className="knowledge-results">
          <div className="section-heading">
            <h2>Resultado RAG</h2>
            <span>
              Intención: {result.intent} · {result.results.length} resultados · {result.diagnostics.totalMs} ms
            </span>
          </div>
          <div className="metrics-grid compact-metrics">
            <article className="metric-card">
              <SlidersHorizontal size={18} />
              <span>Embedding</span>
              <strong>{result.diagnostics.embeddingMs} ms</strong>
            </article>
            <article className="metric-card">
              <SlidersHorizontal size={18} />
              <span>Búsqueda</span>
              <strong>{result.diagnostics.searchMs} ms</strong>
            </article>
            <article className="metric-card">
              <SlidersHorizontal size={18} />
              <span>Rerank</span>
              <strong>{result.diagnostics.rerankMs} ms</strong>
            </article>
          </div>
          <div className="knowledge-result-list">
            {result.results.map((item, index) => (
              <article key={item.chunkId}>
                <strong>
                  {index + 1}. {item.title || item.sectionName || "Fragmento académico"}
                </strong>
                <span>
                  Unidad {item.unitNumber || "?"} · {item.unitName || "Sin unidad"} · {item.topicName || "Sin tema"}
                </span>
                <small>
                  sem {item.semanticScore.toFixed(3)} · text {item.lexicalScore.toFixed(3)} · acad {item.academicScore.toFixed(3)} · final {item.finalScore.toFixed(3)}
                </small>
                <p>{item.contentPreview}</p>
              </article>
            ))}
          </div>
          <details className="ingestion-report">
            <summary>Ver contexto enviado al modelo</summary>
            <pre>{result.contextPreview}</pre>
          </details>
          {debug && (
            <details className="ingestion-report">
              <summary>Ver debug técnico</summary>
              <pre>{JSON.stringify(result.diagnostics.debug, null, 2)}</pre>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
