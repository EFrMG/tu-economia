import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface CopyableCardProps {
  id?: string;
  copyLabel: string;
  text: string | null;
  className: string;
  /** Hides the card from assistive technology while its content is only a loading placeholder. */
  ariaHidden?: boolean;
  children: ReactNode;
}

const CopyableCard = ({
  id,
  copyLabel,
  text,
  className,
  ariaHidden = false,
  children,
}: CopyableCardProps) => {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const summaryId = useId();

  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );

  const copyText = async () => {
    if (text === null) return;

    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Texto copiado");
    } catch {
      setFeedback("No se pudo copiar");
    }

    setVisible(true);

    if (timeout.current) clearTimeout(timeout.current);

    timeout.current = setTimeout(() => setVisible(false), 1600);
  };

  return (
    <article
      id={text === null ? id : undefined}
      tabIndex={text === null && id ? -1 : undefined}
      aria-hidden={ariaHidden || undefined}
      className={`${className} relative ${text === null ? "" : "select-none"}`}
    >
      {children}
      {text !== null ? (
        <>
          <button
            id={id}
            type="button"
            onClick={copyText}
            aria-label={copyLabel}
            aria-describedby={summaryId}
            title={copyLabel}
            className="absolute inset-0 z-20 h-full w-full cursor-copy rounded-none bg-transparent p-0 focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-primary-500/50"
          />
          <div
            className={`pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-surface-900/90 font-mono text-body-lg text-text-100 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
            aria-hidden="true"
          >
            {feedback}
          </div>
          <span id={summaryId} className="sr-only">
            {text}
          </span>
          <span className="sr-only" role="status">
            {feedback}
          </span>
        </>
      ) : null}
    </article>
  );
};

export { CopyableCard };
