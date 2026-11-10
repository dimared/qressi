import {useEffect, useRef, useState} from 'react';
import {transparentMatte} from './colors';
import {makeQr} from './qr';
import {DEFAULT_STYLE, type QrStyle} from './types';

export default function QrPreview({
  data,
  style = DEFAULT_STYLE,
  onError,
}: {
  data: string;
  style?: QrStyle;
  onError?: (error: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      try {
        const qr = makeQr(data, style);
        if (ref.current && !cancelled) {
          ref.current.replaceChildren();
          qr.append(ref.current);
          setError(false);
          onError?.(false);
        }
      } catch {
        if (!cancelled) {
          ref.current?.replaceChildren();
          setError(true);
          onError?.(true);
        }
      }
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [data, style, onError]);
  return (
    <div
      className={`qr-preview ${style.transparent ? `qr-transparent ${transparentMatte(style) === '#000000' ? 'checker-dark' : ''}` : ''}`}
      aria-label="Предпросмотр QR-кода"
    >
      <div ref={ref} />
      {error && (
        <p className="qr-error">
          Слишком много данных для одного QR.
          <br />
          Попробуйте сократить текст.
        </p>
      )}
    </div>
  );
}
