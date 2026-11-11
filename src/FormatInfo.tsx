import {Capacitor} from '@capacitor/core';
import {useEffect, useState} from 'react';
import Dialog from './Dialog';
import {makeQr} from './qr';
import type {QrStyle} from './types';

const size = (bytes?: number) =>
  bytes === undefined
    ? '—'
    : bytes < 1024
      ? `${bytes} Б`
      : `${(bytes / 1024).toLocaleString('ru-RU', {maximumFractionDigits: 1})} КБ`;

export default function FormatInfo({
  data,
  style,
  onClose,
}: {
  data: string;
  style: QrStyle;
  onClose: () => void;
}) {
  const [sizes, setSizes] = useState<{png?: number; svg?: number}>({});
  const [loading, setLoading] = useState(!!data);
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      try {
        const qr = makeQr(data, style, 1200);
        const [png, svg] = await Promise.all([qr.getRawData('png'), qr.getRawData('svg')]);
        if (!cancelled)
          setSizes({
            png: png instanceof Blob ? png.size : undefined,
            svg: svg instanceof Blob ? svg.size : undefined,
          });
      } catch {
        /* Oversized or incomplete payload has no export sizes. */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, style]);
  return (
    <Dialog title="PNG или SVG?" onClose={onClose}>
      <div className="format-info-grid">
        <article>
          <h3>
            PNG <small>{loading ? '…' : size(sizes.png)}</small>
          </h3>
          <p>
            Растровая картинка, 1200 × 1200 пикселей. Подходит для отправки в мессенджерах, вставки в
            документы и публикаций.
          </p>
          <p>При сильном увеличении может потерять чёткость.</p>
          {Capacitor.getPlatform() === 'android' && (
            <p>
              «Сохранить PNG» добавляет картинку в галерею, альбом QRessi (Android 10+). На Android 7–9
              откроется окно выбора папки. «Поделиться PNG» отправляет картинку в другое приложение.
            </p>
          )}
        </article>
        <article>
          <h3>
            SVG <small>{loading ? '…' : size(sizes.svg)}</small>
          </h3>
          <p>
            Векторное изображение. Модули QR остаются чёткими при любом размере — удобно для макетов и печати.
          </p>
          <p>Если есть логотип, его исходное разрешение сохраняется.</p>
          {Capacitor.getPlatform() === 'android' && (
            <p>
              «Сохранить SVG» открывает системное окно сохранения файла. Галерея обычно не показывает SVG.
            </p>
          )}
        </article>
      </div>
      {style.transparent && (
        <p className="hint">
          Прозрачный фон сохраняется в PNG и SVG. Шахматная подложка видна только в предпросмотре.
        </p>
      )}
    </Dialog>
  );
}
