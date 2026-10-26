import type { ButtonHTMLAttributes, ReactNode } from "react";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; children: ReactNode };
const styles = {
  primary: "bg-primary text-text-inverse hover:bg-primary-hover",
  secondary: "border border-border-default bg-surface-card text-text-primary hover:bg-surface-hover",
  danger: "bg-danger text-text-inverse hover:opacity-90",
};
export function ActionButton({ variant = "primary", className = "", children, ...props }: Props) {
  return <button className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`} {...props}>{children}</button>;
}
