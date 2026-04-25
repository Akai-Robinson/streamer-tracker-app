'use client';
import { useState } from 'react';

export function CopyButton({ textToCopy }: { textToCopy: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <button className="url-copy-btn" onClick={handleCopy}>
      {copied ? 'コピーしました！' : 'URLをコピー'}
    </button>
  );
}
