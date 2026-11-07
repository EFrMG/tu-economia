interface WordmarkProps {
  homepage?: boolean;
}

const Wordmark = ({ homepage = false }: WordmarkProps) => (
  <span
    className={`inline-flex items-center font-heading text-headline-md whitespace-nowrap text-text-100 ${homepage && "marketing-wordmark"}`}
  >
    <span className="text-primary-200">T</span>u{" "}
    <span className="pl-[0.33ch] text-text-50">E</span>
    conomía
  </span>
);

export { Wordmark };
