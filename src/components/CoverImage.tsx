import { useEffect, useState } from 'react';
import { Disc3 } from 'lucide-react';
import { resolveCoverUrl } from '../lib/localAudioStore';

interface CoverImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function CoverImage({ src, alt, className = '' }: CoverImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string>(
    src && !src.startsWith('idb://') ? src : ''
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    if (!src) {
      setResolvedSrc('');
      return;
    }
    if (!src.startsWith('idb://')) {
      setResolvedSrc(src);
      return;
    }

    resolveCoverUrl(src)
      .then((url) => {
        if (!cancelled) setResolvedSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed || !resolvedSrc) {
    return (
      <div
        className={`bg-gradient-to-br from-[#16161d] to-[#09090c] flex items-center justify-center text-zinc-600 ${className}`}
        aria-label={alt}
      >
        <Disc3 className="w-7 h-7 opacity-40" />
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
