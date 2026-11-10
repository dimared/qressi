import {contrast} from './data';
import type {QrGradient, QrStyle} from './types';

export type RGB = {r: number; g: number; b: number};
export type HSV = {h: number; s: number; v: number};
export type HSL = {h: number; s: number; l: number};
export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export function normalizeHex(value: string): string | undefined {
  const hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex))
    return `#${Array.from(hex, (c) => c + c)
      .join('')
      .toLowerCase()}`;
  if (/^[\da-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
}
export function hexToRgb(hex: string): RGB {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}
export function rgbToHex({r, g, b}: RGB): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(clamp(v, 0, 255))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
export function rgbToHsv({r, g, b}: RGB): HSV {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return {h: (h * 60 + 360) % 360, s: max ? (delta / max) * 100 : 0, v: max * 100};
}
export function hsvToRgb({h, s, v}: HSV): RGB {
  h = (((h % 360) + 360) % 360) / 60;
  s /= 100;
  v /= 100;
  const c = v * s,
    x = c * (1 - Math.abs((h % 2) - 1)),
    m = v - c;
  const [r, g, b] =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return {r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255};
}
export function rgbToHsl(rgb: RGB): HSL {
  const hsv = rgbToHsv(rgb),
    v = hsv.v / 100,
    s = hsv.s / 100;
  const l = v * (1 - s / 2);
  return {h: hsv.h, s: l === 0 || l === 1 ? 0 : ((v - l) / Math.min(l, 1 - l)) * 100, l: l * 100};
}
export function hslToRgb({h, s, l}: HSL): RGB {
  s /= 100;
  l /= 100;
  const v = l + s * Math.min(l, 1 - l);
  return hsvToRgb({h, s: v ? 2 * (1 - l / v) * 100 : 0, v: v * 100});
}
export function paintCss(color: string, gradient?: QrGradient): string {
  if (!gradient) return color;
  return gradient.type === 'radial'
    ? `radial-gradient(circle, ${color}, ${gradient.color})`
    : `linear-gradient(${gradient.rotation + 90}deg, ${color}, ${gradient.color})`;
}
function paintSamples(color: string, gradient?: QrGradient): string[] {
  if (!gradient) return [color];
  const a = hexToRgb(color),
    b = hexToRgb(gradient.color);
  return [0, 0.25, 0.5, 0.75, 1].map((t) =>
    rgbToHex({r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t}),
  );
}
export function transparentMatte(style: QrStyle): string {
  const colors = paintSamples(style.color, style.foregroundGradient);
  const score = (background: string) => Math.min(...colors.map((color) => contrast(color, background)));
  return score('#ffffff') >= score('#000000') ? '#ffffff' : '#000000';
}
export function styleContrast(style: QrStyle): number {
  const foregrounds = paintSamples(style.color, style.foregroundGradient);
  const backgrounds = style.transparent
    ? [transparentMatte(style)]
    : paintSamples(style.background, style.backgroundGradient);
  return Math.min(...foregrounds.flatMap((fg) => backgrounds.map((bg) => contrast(fg, bg))));
}
