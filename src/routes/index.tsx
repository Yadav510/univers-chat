import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Univers. — Private. Powerful. Yours." },
      {
        name: "description",
        content:
          "Univers. is a premium private messenger. End-to-end secure. Zero data sold.",
      },
    ],
  }),
  component: SplashPage,
});

function SplashPage() {
  return (
    <div
      className="relative min-h-dvh w-full overflow-hidden bg-background flex justify-center items-center px-6"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 starfield opacity-60" />
      
      <div className="relative w-full max-w-[420px] flex flex-col items-center text-center">
        <div className="mb-8 p-6 rounded-full bg-destructive/10 border border-destructive/20 glow-red">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-destructive animate-pulse"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-6 uppercase tracking-wider">
          ESTA EXTENSÃO FOI PIRATEADA
        </h1>

        <p className="text-white/70 text-base leading-relaxed mb-10 max-w-sm">
          A chave utilizada nesta extensão foi bloqueada por uso não autorizado. Fale com o contato oficial abaixo para adquirir a versão original. FALAR COM O CONTATO OFICIAL (91) 98583-7992 ou no botão abaixo
        </p>

        <a
          href="https://wa.me/91985837992"
          target="_blank"
          rel="noopener noreferrer"
          className="press flex h-14 w-full items-center justify-center rounded-[22px] bg-[#25D366] text-[15px] font-bold text-white shadow-[0_0_20px_rgba(37,211,102,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          CHAMAR NO WHATSAPP
        </a>

        <div className="mt-8 text-[11px] text-white/30 uppercase tracking-[0.2em]">
          Acesso Bloqueado
        </div>
      </div>
    </div>
  );
}
