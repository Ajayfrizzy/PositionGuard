import { cn } from "../lib/utils";

export function LoadingButton({
  pending,
  pendingLabel,
  disabled,
  children,
  className = "button primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pending: boolean;
  pendingLabel: string;
}) {
  return (
    <button
      {...props}
      className={cn(className, pending && "is-pending")}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending && <span className="button-spinner" aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </button>
  );
}
