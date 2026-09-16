export type Role = "ADMIN" | "ESTUDIANTE";
export type Profile = {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  status: "active" | "inactive";
  starts_at: string;
  expires_at: string | null;
  created_at: string;
};
export type Unit = {
  id: string;
  number: number;
  name: string;
  enabled: boolean;
};
export type DocumentSummary = {
  id: string;
  title: string;
  source: string;
  version: string;
  status: "pending" | "processing" | "ready" | "failed";
  created_at: string;
  processed_at?: string | null;
  ingestion_report?: unknown;
};
export type UsageEvent = {
  user_id: string;
  input_tokens: number;
  output_tokens: number;
  audio_input: number;
  audio_output: number;
  estimated_cost: number | null;
};
export type ActionState = { error?: string; success?: string };
