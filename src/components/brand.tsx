import { ShieldCheck } from "lucide-react";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <ShieldCheck size={27} strokeWidth={1.65} />
      </span>
      <span>
        <strong>
          FATESCIPOL<span className="brand-dot">.</span>
        </strong>
        <small>
          {compact ? "TUTOR INTELIGENTE" : "FORMACIÓN CON PROPÓSITO"}
        </small>
      </span>
    </div>
  );
}
