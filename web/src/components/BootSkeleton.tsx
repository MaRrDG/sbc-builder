// The app's shape while Clerk and the app code load: top bar, sidebar, a few set cards. No text, no spinner.
export function BootSkeleton() {
  return (
    <div className="boot boot-skeleton" aria-busy="true">
      <div className="sk-top" />
      <div className="sk-body">
        <div className="sk-side" />
        <div className="sk-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="sk-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
