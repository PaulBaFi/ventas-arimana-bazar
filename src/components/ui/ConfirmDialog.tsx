import { useEffect } from "react";
import { ActionButton } from "./ActionButton";
import { AlertTriangle, Check, X } from "lucide-react";
export function ConfirmDialog({ open, title, message, onConfirm, onCancel }: { open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => { if (!open) return; const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [open, onCancel]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-xl bg-surface-card p-6 shadow-modal">
       <h2 id="confirm-title" className="flex items-center gap-2 text-lg font-bold"><AlertTriangle size={19} className="text-warning" aria-hidden="true" />{title}</h2><p className="mt-2 text-sm text-text-secondary">{message}</p>
       <div className="mt-6 flex justify-end gap-3"><ActionButton variant="secondary" icon={X} onClick={onCancel}>Cancelar</ActionButton><ActionButton variant="danger" icon={Check} onClick={onConfirm}>Confirmar</ActionButton></div>
    </section>
  </div>;
}
