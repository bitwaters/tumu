import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import type { Severity, SiteItemStatus } from "./types";
import { severityText, statusText } from "./model";

export function Button({
  children,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button className={`btn btn-${variant}`} {...props}>
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className="icon-btn" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function TextArea(props: InputHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input textarea" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input select" {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function PageHeader({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {meta ? <p>{meta}</p> : null}
      </div>
      {action ? <div className="page-action">{action}</div> : null}
    </header>
  );
}

export function StatusTag({ status }: { status: SiteItemStatus; overdue?: boolean; dueSoon?: boolean }) {
  return <span className={`tag tag-${status}`}>{statusText[status]}</span>;
}

export function TimingTag({ overdue, dueSoon }: { overdue?: boolean; dueSoon?: boolean }) {
  if (!overdue && !dueSoon) return null;
  return <span className={`tag tag-${overdue ? "overdue" : "due-soon"}`}>{overdue ? "超期" : "临期"}</span>;
}

export function SeverityTag({ severity }: { severity: Severity }) {
  return <span className={`tag severity-${severity}`}>{severityText[severity]}</span>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function MetricCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
