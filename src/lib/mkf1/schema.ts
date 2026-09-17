import { z } from "zod";

export const MKF_SCHEMA_VERSION = "MKF-1.0" as const;

export const contentTypeValues = [
  "DEFINITION",
  "ENUMERATION",
  "CLASSIFICATION",
  "PRINCIPLE",
  "VALUE",
  "CHARACTERISTIC",
  "RULE",
  "NORMATIVE",
  "ARTICLE",
  "PROCEDURE",
  "PROCEDURE_STEP",
  "REQUIREMENT",
  "EXCEPTION",
  "COMPARISON",
  "CAUSE_EFFECT",
  "EXAMPLE",
  "APPLICATION",
  "CASE",
  "FORMULA",
  "METHODOLOGY",
  "SOURCE_NOTE",
  "GENERAL_ACADEMIC_KNOWLEDGE",
  "OTHER",
] as const;

export const sourceScopeValues = [
  "OFFICIAL_SOURCE",
  "COMPENDIUM_EXPLANATION",
  "GENERAL_ACADEMIC_KNOWLEDGE",
  "UNKNOWN",
  "AI_GENERATED",
] as const;

export const relationTypeValues = [
  "PARENT_OF",
  "CHILD_OF",
  "RELATED_TO",
  "PART_OF",
  "HAS_PRINCIPLE",
  "HAS_VALUE",
  "HAS_CHARACTERISTIC",
  "HAS_STEP",
  "PRECEDES",
  "FOLLOWS",
  "CONTRASTS_WITH",
  "DEPENDS_ON",
  "SOURCE_OF",
] as const;

export const cognitiveObjectiveValues = [
  "IDENTIFY",
  "DEFINE",
  "ENUMERATE",
  "EXPLAIN",
  "DISTINGUISH",
  "RELATE",
  "APPLY",
  "ANALYZE",
  "ARGUE",
  "ORDER",
] as const;

export const processingStatusValues = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "REVIEW_REQUIRED",
  "FAILED",
] as const;

export const ContentTypeSchema = z.enum(contentTypeValues);
export const SourceScopeSchema = z.enum(sourceScopeValues);
export const RelationTypeSchema = z.enum(relationTypeValues);
export const CognitiveObjectiveSchema = z.enum(cognitiveObjectiveValues);
export const ProcessingStatusSchema = z.enum(processingStatusValues);

export const ExpectedConceptSchema = z.object({
  concept: z.string().min(1),
  required: z.boolean(),
  weight: z.number().min(0).max(1),
});

export const ProcedureStepSchema = z.object({
  order: z.number().int().positive(),
  title: z.string().nullable(),
  content: z.string().min(1),
});

export const KnowledgeObjectSchema = z
  .object({
    schema_version: z.literal(MKF_SCHEMA_VERSION),
    knowledge_id: z.string().min(3),
    document_version: z.string().min(1),
    knowledge_version: z.number().int().positive().default(1),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    active: z.boolean().default(true),
    hierarchy: z.object({
      unit_id: z.string().regex(/^U\d{2}$/),
      unit_number: z.number().int().min(1).max(15),
      unit_name: z.string().min(1),
      topic_number: z.string().nullable(),
      topic_name: z.string().nullable(),
      section_number: z.string().nullable(),
      section_name: z.string().nullable(),
    }),
    knowledge: z.object({
      concept: z.string().min(1),
      title: z.string().min(1),
      content_type: ContentTypeSchema,
      source_content: z.string().min(1),
      parent_id: z.string().nullable(),
      child_ids: z.array(z.string()).default([]),
      sequence_required: z.boolean().default(false),
      steps: z.array(ProcedureStepSchema).default([]),
      source_hash: z.string().min(20),
    }),
    retrieval: z.object({
      keywords: z.array(z.string()).default([]),
      aliases: z.array(z.string()).default([]),
      related_concepts: z.array(z.string()).default([]),
      search_terms: z.array(z.string()).default([]),
    }),
    provenance: z.object({
      scope: SourceScopeSchema,
      compendium: z.literal("Compendio FATESCIPOL El Alto – Examen de Grado 2026"),
      original_source: z.string().nullable(),
      year: z.number().int().nullable(),
      page_start: z.number().int().positive().nullable(),
      page_end: z.number().int().positive().nullable(),
      source_reference: z.string().nullable(),
    }),
    pedagogy: z.object({
      importance: z.enum(["HIGH", "MEDIUM", "LOW"]),
      difficulty: z.enum(["BASIC", "INTERMEDIATE", "ADVANCED"]),
      learning_objectives: z.array(CognitiveObjectiveSchema).default([]),
      prerequisites: z.array(z.string()).default([]),
      common_confusions: z.array(z.string()).default([]),
      suitable_for_example: z.boolean(),
      suitable_for_case: z.boolean(),
      suitable_for_oral_exam: z.boolean(),
      generated_metadata: z.literal(true),
    }),
    assessment: z.object({
      can_ask_definition: z.boolean(),
      can_ask_enumeration: z.boolean(),
      can_ask_explanation: z.boolean(),
      can_ask_comparison: z.boolean(),
      can_ask_application: z.boolean(),
      can_ask_ordering: z.boolean(),
      can_generate_followup: z.boolean(),
      expected_concepts: z.array(ExpectedConceptSchema).default([]),
    }),
    validation: z.object({
      structure_valid: z.boolean(),
      source_preserved: z.boolean(),
      classification_confidence: z.number().min(0).max(1),
      hierarchy_confidence: z.number().min(0).max(1),
      requires_review: z.boolean(),
      warnings: z.array(z.string()).default([]),
    }),
  })
  .superRefine((object, ctx) => {
    const total = object.assessment.expected_concepts.reduce(
      (sum, item) => sum + item.weight,
      0,
    );
    if (total > 1.000001) {
      ctx.addIssue({
        code: "custom",
        path: ["assessment", "expected_concepts"],
        message: "La suma de pesos de expected_concepts no puede superar 1.",
      });
    }
    if (object.provenance.scope === "AI_GENERATED") {
      ctx.addIssue({
        code: "custom",
        path: ["provenance", "scope"],
        message: "AI_GENERATED no puede utilizarse como procedencia de source_content.",
      });
    }
    if (
      object.knowledge.content_type === "PROCEDURE" &&
      object.knowledge.steps.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["knowledge", "steps"],
        message: "Un procedimiento debe conservar pasos en orden original.",
      });
    }
  });

export const KnowledgeRelationSchema = z.object({
  from_id: z.string().min(3),
  to_id: z.string().min(3),
  relation_type: RelationTypeSchema,
  confidence: z.number().min(0).max(1),
  generated_metadata: z.boolean().default(false),
});

export const MkfUnitReportSchema = z.object({
  unit_id: z.string(),
  unit_number: z.number().int().min(1).max(15),
  unit_name: z.string(),
  topics: z.number().int().nonnegative(),
  knowledge_objects: z.number().int().nonnegative(),
  definitions: z.number().int().nonnegative(),
  enumerations: z.number().int().nonnegative(),
  procedures: z.number().int().nonnegative(),
  normative_objects: z.number().int().nonnegative(),
  examples: z.number().int().nonnegative(),
  relations: z.number().int().nonnegative(),
  review_required: z.number().int().nonnegative(),
});

export type ContentType = z.infer<typeof ContentTypeSchema>;
export type SourceScope = z.infer<typeof SourceScopeSchema>;
export type RelationType = z.infer<typeof RelationTypeSchema>;
export type CognitiveObjective = z.infer<typeof CognitiveObjectiveSchema>;
export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;
export type KnowledgeObject = z.infer<typeof KnowledgeObjectSchema>;
export type KnowledgeRelation = z.infer<typeof KnowledgeRelationSchema>;
