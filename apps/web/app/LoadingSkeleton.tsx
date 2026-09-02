type LoadingSkeletonVariant = "page" | "rows" | "cards" | "metrics" | "search";

export function LoadingSkeleton({
  variant,
  rows = 3,
  label = "Loading content",
}: {
  variant: LoadingSkeletonVariant;
  rows?: number;
  label?: string;
}) {
  const items = Array.from({ length: rows }, (_, index) => index);

  return (
    <div
      className={`loading-skeleton loading-skeleton--${variant}`}
      role="status"
      aria-label={label}
    >
      {variant === "page" && (
        <>
          <span className="loading-skeleton__title" />
          <span className="loading-skeleton__hero" />
          <span className="loading-skeleton__heading" />
          <div className="loading-skeleton__page-rows">
            {items.map((index) => (
              <SkeletonRow key={index} />
            ))}
          </div>
        </>
      )}

      {(variant === "rows" || variant === "search") &&
        items.map((index) => <SkeletonRow key={index} />)}

      {variant === "cards" &&
        items.map((index) => (
          <span className="loading-skeleton__card" key={index}>
            <i />
            <b />
            <em />
          </span>
        ))}

      {variant === "metrics" &&
        items.map((index) => (
          <span className="loading-skeleton__metric" key={index}>
            <i />
            <b />
            <em />
          </span>
        ))}
    </div>
  );
}

function SkeletonRow() {
  return (
    <span className="loading-skeleton__row">
      <i />
      <span>
        <b />
        <em />
      </span>
    </span>
  );
}
