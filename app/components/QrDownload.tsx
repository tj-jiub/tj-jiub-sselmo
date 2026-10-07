import { useEffect, useState } from "react";

export function QrDownload({ url, filename }: { url: string; filename: string }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((m) => m.default.toDataURL(url, { width: 1024, margin: 2 }))
      .then((dataUrl) => alive && setHref(dataUrl));
    return () => {
      alive = false;
    };
  }, [url]);

  if (!href) return <span className="text-sm text-muted">QR 만드는 중…</span>;
  return (
    <div className="flex items-center gap-4">
      <img src={href} alt={`${url} QR 코드`} className="size-28 border border-line" />
      <a href={href} download={filename} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper">
        QR 이미지 받기 (PNG)
      </a>
    </div>
  );
}
