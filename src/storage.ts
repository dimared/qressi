import {Capacitor, registerPlugin} from '@capacitor/core';
import {validateBackup} from './data';
import type {Entry} from './types';

const KEY = 'qressi-history-v1';
let queue = Promise.resolve();
export type SaveResult = {saved: boolean; destination?: 'gallery' | 'file' | 'download'};
const FileExport = registerPlugin<{
  save: (options: {
    data: string;
    filename: string;
    mimeType: string;
    gallery: boolean;
  }) => Promise<SaveResult>;
}>('FileExport');

export async function readClipboard(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const {Clipboard} = await import('@capacitor/clipboard');
    const {value, type} = await Clipboard.read();
    if (type !== 'text/plain' && type !== 'text/html') throw new Error('В буфере нет текста.');
    return value;
  }
  if (!navigator.clipboard?.readText) throw new Error('Вставьте текст в поле через меню или Ctrl/⌘ + V.');
  return navigator.clipboard.readText();
}

export async function loadHistory(): Promise<Entry[]> {
  let raw: string | null;
  if (Capacitor.isNativePlatform()) {
    const {Preferences} = await import('@capacitor/preferences');
    raw = (await Preferences.get({key: KEY})).value;
  } else raw = localStorage.getItem(KEY);
  return raw ? validateBackup(JSON.parse(raw)) : [];
}

export function saveHistory(entries: Entry[]): Promise<void> {
  const value = JSON.stringify({version: 1, entries});
  const operation = queue
    .catch(() => {})
    .then(async () => {
      if (Capacitor.isNativePlatform()) {
        const {Preferences} = await import('@capacitor/preferences');
        await Preferences.set({key: KEY, value});
      } else {
        try {
          localStorage.setItem(KEY, value);
        } catch {
          throw new Error(
            'Память истории недоступна или заполнена. Сохраните резервную копию и освободите место.',
          );
        }
      }
    });
  queue = operation;
  return operation;
}

export async function copyText(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const {Clipboard} = await import('@capacitor/clipboard');
    await Clipboard.write({string: text});
  } else await navigator.clipboard.writeText(text);
}

async function blobBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Не удалось подготовить файл.'));
    reader.readAsDataURL(blob);
  });
}

export async function saveFile(blob: Blob, filename: string, gallery = false): Promise<SaveResult> {
  if (Capacitor.getPlatform() === 'android') {
    return FileExport.save({
      data: await blobBase64(blob),
      filename,
      mimeType: blob.type || 'application/octet-stream',
      gallery,
    });
  }
  if (Capacitor.isNativePlatform()) {
    await shareFile(blob, filename);
    return {saved: false};
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return {saved: true, destination: 'download'};
}

export function savedFileMessage(result: SaveResult, format: string): string | undefined {
  if (!result.saved) return;
  if (result.destination === 'gallery') return 'PNG сохранён в галерею · альбом QRessi';
  if (result.destination === 'download') return `Скачивание ${format} начато`;
  return `Файл ${format} сохранён`;
}

export async function shareFile(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{Directory, Filesystem}, {Share}] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const base64 = await blobBase64(blob);
    const {uri} = await Filesystem.writeFile({path: filename, data: base64, directory: Directory.Cache});
    try {
      await Share.share({title: 'QRessi', files: [uri], dialogTitle: 'Поделиться PNG'});
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Share canceled') throw error;
    }
  } else {
    await saveFile(blob, filename);
  }
}
