import { useState } from "react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => window.prompt("복사해서 쓰세요", text))
      }
      className="rounded-lg border border-ink px-4 py-2 text-sm font-semibold"
    >
      {copied ? "복사했어요" : label}
    </button>
  );
}
