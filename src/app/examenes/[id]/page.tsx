import { redirect } from "next/navigation";

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/examenes/${id}/resultados`);
}
