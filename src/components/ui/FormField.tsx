import type { InputHTMLAttributes, ReactNode } from "react";
export function FormField({ label, error, hint, children, ...inputProps }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; children?: ReactNode }) {
  const id = inputProps.id ?? inputProps.name;
  return <div className="grid gap-1.5"><label htmlFor={id} className="text-sm font-semibold text-text-primary">{label}{inputProps.required && <span aria-hidden="true" className="ml-1 text-danger">*</span>}</label>
    {children ?? <input {...inputProps} id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={`min-h-10 rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-border-primary ${error ? "border-danger" : "border-border-default"} ${inputProps.className ?? ""}`} />}
    {error && <p id={`${id}-error`} className="text-xs text-danger">{error}</p>}{!error && hint && <p id={`${id}-hint`} className="text-xs text-text-secondary">{hint}</p>}</div>;
}
