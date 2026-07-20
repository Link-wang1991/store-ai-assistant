type AppLoadingProps = {
  label?: string;
};

/** A calm, app-wide loading surface for routes that hydrate client-side data. */
export function AppLoading({ label = "正在加载…" }: AppLoadingProps) {
  return (
    <div className="app-loading" role="status" aria-live="polite">
      <span className="app-loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
