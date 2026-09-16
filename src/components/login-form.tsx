"use client";
import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { login } from "@/app/actions/auth";

export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(login, {});
  const [visible, setVisible] = useState(false);
  return (
    <form action={action} className="login-form">
      <div className="field">
        <label htmlFor="username">Usuario</label>
        <div className="input-icon">
          <UserRound size={18} />
          <input
            id="username"
            name="username"
            autoComplete="username"
            placeholder="Tu usuario institucional"
            required
            minLength={3}
            maxLength={32}
            autoCapitalize="none"
            spellCheck={false}
            disabled={!configured}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <div className="input-icon">
          <LockKeyhole size={18} />
          <input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Ingresa tu contraseña"
            required
            maxLength={128}
            disabled={!configured}
          />
          <button
            type="button"
            className="icon-button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      <button
        className="button primary login-submit"
        disabled={pending || !configured}
      >
        {pending ? "Verificando acceso…" : "Ingresar a mi aula"}
        <ArrowRight size={19} />
      </button>
      <p className="form-help">
        ¿Necesitas acceso o recuperar tu contraseña?
        <br />
        <span>Comunícate con tu administrador académico.</span>
      </p>
    </form>
  );
}
