// A generic player silhouette for the mystery card: never the real portrait (that would give the answer away).
export function Silhouette({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <path d="M60 14c-14 0-24 11-24 25 0 9 4 17 10 22-15 5-27 15-31 30-1 4 2 7 6 7h78c4 0 7-3 6-7-4-15-16-25-31-30 6-5 10-13 10-22 0-14-10-25-24-25z" fill="currentColor" />
    </svg>
  );
}
