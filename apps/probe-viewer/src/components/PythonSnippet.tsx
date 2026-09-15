import { useCallback, useEffect, useRef, useState } from "react";

const ChevronDownIcon = (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const CopyIcon = (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

const CheckIcon = (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

interface PythonSnippetProps {
  manufacturer: string;
  model: string;
}

// "Python" toggle for the probe subtitle. It opens a popover with the
// probeinterface code that loads this probe from the library.
export function PythonSnippet({ manufacturer, model }: PythonSnippetProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // The snippet as (token kind, text) pairs, so the highlighted markup and the
  // copied text come from the same source.
  const tokens: [string | null, string][] = [
    ["keyword", "from"],
    [null, " probeinterface "],
    ["keyword", "import"],
    [null, " get_probe\n\nprobe = "],
    ["function", "get_probe"],
    [null, "("],
    ["string", `"${manufacturer}"`],
    [null, ", "],
    ["string", `"${model}"`],
    [null, ")"],
  ];
  const code = tokens.map(([, text]) => text).join("");

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  // Close on a click outside the popover or on Escape.
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <span className="viewer-snippet" ref={ref}>
      <button
        type="button"
        className="viewer-snippet-toggle"
        onClick={() => setOpen((value) => !value)}
        title="Show how to load this probe with probeinterface"
        aria-expanded={open}
      >
        <span className="viewer-json-link-text">Python</span>
        {ChevronDownIcon}
      </button>
      {open && (
        <span className="viewer-snippet-popover">
          <span className="viewer-snippet-header">
            <span className="viewer-snippet-language">Python</span>
            <button
              type="button"
              className="viewer-snippet-copy"
              onClick={handleCopy}
              aria-label="Copy code"
            >
              {copied ? CheckIcon : CopyIcon}
              {copied ? "Copied!" : "Copy"}
            </button>
          </span>
          <code className="viewer-snippet-code">
            {tokens.map(([kind, text], index) => (
              <span key={index} className={kind ? `viewer-snippet-token--${kind}` : undefined}>
                {text}
              </span>
            ))}
          </code>
        </span>
      )}
    </span>
  );
}
