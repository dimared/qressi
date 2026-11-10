import QRCodeStyling, {type Gradient} from 'qr-code-styling';
import {transparentMatte} from './colors';
import {DEFAULT_STYLE, type QrGradient, type QrStyle} from './types';

function gradientOptions(color: string, gradient?: QrGradient): Gradient | undefined {
  return gradient
    ? {
        type: gradient.type,
        rotation: (gradient.rotation * Math.PI) / 180,
        colorStops: [
          {offset: 0, color},
          {offset: 1, color: gradient.color},
        ],
      }
    : undefined;
}

function centerTextImage(value: NonNullable<QrStyle['centerText']>): string {
  const text = Array.from(
    new TextDecoder()
      .decode(new TextEncoder().encode(value.text))
      .replace(/[\u0000-\u001f\u007f\ufffe\uffff]/g, ' ')
      .trim(),
  )
    .slice(0, 24)
    .join('');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = '700 72px sans-serif';
  const fontSize = Math.min(72, (72 * 264) / Math.max(1, ctx.measureText(text).width));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '300');
  svg.setAttribute('height', '100');
  svg.setAttribute('viewBox', '0 0 300 100');
  const label = document.createElementNS(svg.namespaceURI, 'text');
  for (const [name, attributeValue] of Object.entries({
    x: '150',
    y: '50',
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-family': 'sans-serif',
    'font-weight': '700',
    'font-size': String(fontSize),
    fill: value.color,
  }))
    label.setAttribute(name, attributeValue);
  label.textContent = text;
  svg.appendChild(label);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
}

export function makeQr(data: string, style: QrStyle = DEFAULT_STYLE, size = 320): QRCodeStyling {
  // qr-code-styling embeds qrcode-generator's default 8-bit encoder, which
  // truncates Unicode code units. Pass UTF-8 bytes as a binary string instead.
  const bytes = new TextEncoder().encode(data);
  const encoded = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const qr = new QRCodeStyling({
    // Four quiet-zone modules even for the smallest (21-module) QR version.
    width: size,
    height: size,
    type: 'svg',
    data: encoded,
    margin: Math.ceil((size * 4) / 29),
    qrOptions: {errorCorrectionLevel: 'H', ...(encoded !== data ? {mode: 'Byte' as const} : {})},
    dotsOptions: {
      type: style.dots,
      color: style.color,
      gradient: gradientOptions(style.color, style.foregroundGradient),
    },
    // Keep finder patterns conventional even when data modules are circular.
    cornersSquareOptions: {type: style.dots === 'rounded' ? 'extra-rounded' : 'square', color: style.color},
    cornersDotOptions: {type: 'square', color: style.color},
    backgroundOptions: {
      color: style.transparent ? 'transparent' : style.background,
      gradient: style.transparent ? undefined : gradientOptions(style.background, style.backgroundGradient),
    },
    image: style.centerText?.text.trim() ? centerTextImage(style.centerText) : style.logo,
    imageOptions: {
      imageSize: style.centerText?.text.trim() ? 0.1 : 0.25,
      margin: Math.round(size * (style.centerText?.text.trim() ? 0.006 : 0.012)),
      hideBackgroundDots: true,
      crossOrigin: 'anonymous',
    },
  });
  if (style.dots === 'dots') {
    qr.applyExtension((svg) => {
      // The library exposes the generated matrix. Preserve timing/alignment
      // modules as squares: circular 5×5 alignment patterns confuse decoders
      // on some larger QR versions, even with excellent contrast.
      const matrix = qr._qr;
      if (!matrix) return;
      const count = matrix.getModuleCount();
      const protectedCells = new Set<number>();
      for (let centerRow = 2; centerRow < count - 2; centerRow++) {
        for (let centerCol = 2; centerCol < count - 2; centerCol++) {
          let alignment = true;
          for (let dy = -2; dy <= 2 && alignment; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (
                matrix.isDark(centerRow + dy, centerCol + dx) !==
                (Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
              ) {
                alignment = false;
                break;
              }
            }
          }
          if (alignment) {
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) protectedCells.add((centerRow + dy) * count + centerCol + dx);
            }
          }
        }
      }
      const moduleSize = Math.floor((size - Math.ceil((size * 4) / 29) * 2) / count);
      const origin = Math.floor((size - count * moduleSize) / 2);
      for (const circle of svg.querySelectorAll('clipPath[id^="clip-path-dot-color-"] circle')) {
        const x = Number(circle.getAttribute('cx')) - moduleSize / 2;
        const y = Number(circle.getAttribute('cy')) - moduleSize / 2;
        const col = Math.round((x - origin) / moduleSize),
          row = Math.round((y - origin) / moduleSize);
        if (row !== 6 && col !== 6 && !protectedCells.has(row * count + col)) continue;
        const square = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        for (const [key, value] of Object.entries({x, y, width: moduleSize, height: moduleSize}))
          square.setAttribute(key, String(value));
        circle.replaceWith(square);
      }
    });
  }
  return qr;
}

export async function checkQr(
  qr: QRCodeStyling,
  expected: string,
  style: QrStyle = DEFAULT_STYLE,
): Promise<boolean> {
  const raw = await qr.getRawData('png');
  if (!(raw instanceof Blob)) throw new Error('Не удалось подготовить изображение.');
  const {decodeImage} = await import('./scanner');
  const results = await decodeImage(raw, style.transparent ? transparentMatte(style) : '#ffffff');
  return results.includes(expected);
}
