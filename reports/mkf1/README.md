# MKF-1 Sprint 5A

Esta carpeta contiene reportes generados por el Motor de Conocimiento Académico MKF-1.

El Sprint 5A no ejecuta ingesta vectorial, no genera embeddings y no reemplaza el RAG existente de la Unidad 1. El compendio original sigue siendo la fuente maestra; MKF-1 conserva `source_content` y separa la metadata pedagógica generada.

Para regenerar reportes localmente:

```powershell
node scripts/mkf1-generate.mjs "C:/Users/ZBook/Downloads/COMPENDIO_FATESCIPOL_EL_ALTO_2026_CORREGIDO_SIN_CAPITULOS.docx"
```

Salidas obligatorias:

- `mkf1-summary.json`
- `mkf1-units.json`
- `mkf1-knowledge-types.json`
- `mkf1-review-required.json`
- `mkf1-relations.json`
- `mkf1-validation.json`
