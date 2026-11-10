import {
  CODE_FORMATS,
  type CodeFormat,
  type ContentKind,
  type Entry,
  type QrGradient,
  type QrStyle,
} from './types';

export function mapUriFor(data: string): string | undefined {
  if (!/^geo:/i.test(data) || data.length > 4096 || /[\u0000-\u001f]/.test(data)) return;
  try {
    const uri = new URL(data.replace(/^geo:/i, 'geo:'));
    if (!uri.pathname) return;
    if (!uri.search && /^-?[\d.]+,-?[\d.]+$/.test(uri.pathname)) {
      const [latitude, longitude] = uri.pathname.split(',').map(Number);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        return;
      return `geo:${latitude},${longitude}?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
    }
    return uri.href;
  } catch {
    return;
  }
}

export function identify(data: string): ContentKind {
  if (/^geo:/i.test(data)) return 'geo';
  try {
    const url = new URL(data);
    if (
      url.protocol === 'https:' &&
      url.hostname === 'play.google.com' &&
      url.pathname === '/store/apps/details' &&
      url.searchParams.get('id')
    )
      return 'app';
  } catch {
    /* Not a URL. */
  }
  if (/^https?:\/\//i.test(data)) return 'url';
  if (/^WIFI:/i.test(data)) return 'wifi';
  if (/^BEGIN:VCARD/i.test(data)) return 'contact';
  if (/^mailto:/i.test(data)) return 'email';
  if (/^tel:/i.test(data)) return 'phone';
  return 'text';
}

export function titleFor(data: string): string {
  switch (identify(data)) {
    case 'geo':
      return `Координаты ${data.slice(4).split('?')[0]}`;
    case 'app':
      try {
        return new URL(data).searchParams.get('id') || 'Приложение';
      } catch {
        return 'Приложение';
      }
    case 'url':
      try {
        return new URL(data).hostname;
      } catch {
        return data.slice(0, 60);
      }
    case 'wifi':
      return /(?:^|;)S:((?:\\.|[^;])*)/.exec(data.slice(5))?.[1].replace(/\\(.)/g, '$1') || 'Сеть Wi-Fi';
    case 'contact':
      return /(?:^|\r?\n)FN:(.*)/i.exec(data)?.[1] || 'Контакт';
    case 'email':
      return data.slice(7).split('?')[0];
    case 'phone':
      return data.slice(4);
    default:
      return data.split('\n')[0].slice(0, 60) || 'QR-код';
  }
}

export function makeEntry(
  data: string,
  source: Entry['source'],
  title?: string,
  style?: QrStyle,
  codeFormat: CodeFormat = 'QR_CODE',
): Entry {
  return {
    id: crypto.randomUUID(),
    data,
    source,
    title: title?.trim() || titleFor(data),
    kind: identify(data),
    date: new Date().toISOString(),
    favorite: false,
    style,
    codeFormat,
  };
}

export function mergeEntry(entries: Entry[], entry: Entry): Entry[] {
  const old = entries.find(
    (item) =>
      item.data === entry.data &&
      item.source === entry.source &&
      (item.codeFormat || 'QR_CODE') === (entry.codeFormat || 'QR_CODE'),
  );
  return [
    {...entry, id: old?.id || entry.id, favorite: old?.favorite || false},
    ...entries.filter((item) => item.id !== old?.id),
  ].slice(0, 1000);
}

export function escapeWifi(value: string): string {
  return value.replace(/[\\;,:"&]/g, '\\$&');
}
export function escapeVcard(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, '\\$&');
}

export function contrast(a: string, b: string): number {
  const lum = (color: string) => {
    const rgb = [1, 3, 5]
      .map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const l1 = lum(a),
    l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function validateBackup(value: unknown): Entry[] {
  if (!value || typeof value !== 'object' || !('entries' in value) || !Array.isArray(value.entries))
    throw new Error('Это не резервная копия QRessi.');
  if (value.entries.length > 1000) throw new Error('В копии больше 1000 записей.');
  return value.entries.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Повреждённая запись в копии.');
    const e = item as Record<string, unknown>;
    if (
      typeof e.data !== 'string' ||
      e.data.length > 16384 ||
      !e.data ||
      typeof e.title !== 'string' ||
      !['created', 'scanned'].includes(String(e.source))
    )
      throw new Error('Некорректная запись в копии.');
    const entry = makeEntry(e.data, e.source as Entry['source'], e.title.slice(0, 120));
    entry.favorite = e.favorite === true;
    if (CODE_FORMATS.includes(e.codeFormat as CodeFormat)) entry.codeFormat = e.codeFormat as CodeFormat;
    if (typeof e.date === 'string' && Number.isFinite(Date.parse(e.date))) entry.date = e.date;
    const style = e.style as QrStyle | undefined;
    if (
      style &&
      ['square', 'rounded', 'dots'].includes(style.dots) &&
      /^#[\da-f]{6}$/i.test(style.color) &&
      /^#[\da-f]{6}$/i.test(style.background)
    ) {
      entry.style = {dots: style.dots, color: style.color, background: style.background};
      entry.style.transparent = style.transparent === true;
      const gradient = (value: unknown): QrGradient | undefined => {
        if (!value || typeof value !== 'object') return;
        const g = value as QrGradient;
        if (
          !['linear', 'radial'].includes(g.type) ||
          typeof g.color !== 'string' ||
          !/^#[\da-f]{6}$/i.test(g.color) ||
          typeof g.rotation !== 'number' ||
          !Number.isFinite(g.rotation) ||
          g.rotation < 0 ||
          g.rotation > 360
        )
          return;
        return {type: g.type, color: g.color, rotation: g.rotation};
      };
      entry.style.foregroundGradient = gradient(style.foregroundGradient);
      entry.style.backgroundGradient = gradient(style.backgroundGradient);
      if (
        style.centerText &&
        typeof style.centerText.text === 'string' &&
        typeof style.centerText.color === 'string' &&
        /^#[\da-f]{6}$/i.test(style.centerText.color)
      ) {
        entry.style.centerText = {
          text: Array.from(style.centerText.text).slice(0, 24).join(''),
          color: style.centerText.color,
        };
      }
      if (
        typeof style.logo === 'string' &&
        style.logo.length < 200000 &&
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(style.logo)
      )
        entry.style.logo = style.logo;
    }
    return entry;
  });
}
