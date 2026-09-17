import Link from "next/link";
import { History, MessageSquarePlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireStudent } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export default async function TutorHistoryPage() {
  const profile = await requireStudent();
  const { data } = await createSupabaseAdmin()
    .from("tutor_conversations")
    .select("id,title,created_at,updated_at,tutor_messages(content,role,created_at)")
    .eq("user_id", profile.id)
    .order("updated_at", { ascending: false })
    .limit(30);

  const conversations = data || [];

  return (
    <AppShell profile={profile} active="tutor">
      <div className="page-heading">
        <div>
          <span className="eyebrow">HISTORIAL DEL TUTOR</span>
          <h1>
            Mis conversaciones<span className="heading-dot">.</span>
          </h1>
          <p>Abre una conversación anterior o inicia una nueva práctica.</p>
        </div>
        <Link className="button primary" href="/tutor">
          <MessageSquarePlus size={17} /> Nueva conversación
        </Link>
      </div>

      <section className="panel history-list">
        {conversations.length ? (
          conversations.map((conversation) => {
            const messages = Array.isArray(conversation.tutor_messages)
              ? conversation.tutor_messages
              : [];
            const lastMessage = messages
              .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
            return (
              <Link
                className="history-card"
                key={conversation.id}
                href={`/tutor?conversation=${conversation.id}`}
              >
                <History size={20} />
                <div>
                  <strong>{conversation.title}</strong>
                  <span>
                    {new Date(conversation.updated_at).toLocaleString("es-BO", {
                      timeZone: "America/La_Paz",
                    })}
                  </span>
                  <p>{lastMessage?.content?.slice(0, 180) || "Sin mensajes todavía."}</p>
                </div>
              </Link>
            );
          })
        ) : (
          <p className="notice">Aún no tienes conversaciones guardadas.</p>
        )}
      </section>
    </AppShell>
  );
}
