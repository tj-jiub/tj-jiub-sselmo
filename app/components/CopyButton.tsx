import { useState } from "react";
import { btnSmallGhost } from "~/components/ui";

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
      className={btnSmallGhost}
    >
      {copied ? "복사했어요" : label}
    </button>
  );
}
