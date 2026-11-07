interface SkeletonProps {
  className?: string;
}

/** A quiet data placeholder. The parent keeps the final element's dimensions. */
export const Skeleton = ({ className = "" }: SkeletonProps) => (
  <span
    className={`block bg-surface-900 motion-safe:animate-pulse ${className}`}
    aria-hidden="true"
  />
);
