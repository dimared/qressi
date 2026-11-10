import {Capacitor} from '@capacitor/core';
import {Button, TextInput} from '@gravity-ui/uikit';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Copy,
  Heart,
  Palette,
  Pencil,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import {useEffect, useState} from 'react';
import {mapUriFor} from './data';
import {openMap} from './device';
import {checkQr, makeQr} from './qr';
import QrPreview from './QrPreview';
import {copyText, savedFileMessage, saveFile, shareFile} from './storage';
import {LABELS, type Entry, type Notify} from './types';

export default function Detail({
  entry,
  saved,
  onClose,
  onUpdate,
  onDelete,
  onEdit,
  onKeep,
  notify,
}: {
  entry: Entry;
  saved: boolean;
  onClose: () => void;
  onUpdate: (entry: Entry) => Promise<void>;
  onDelete: () => Promise<void>;
  onEdit: () => void;
  onKeep: () => Promise<void>;
  notify: Notify;
}) {
  const [title, setTitle] = useState(entry.title);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrError, setQrError] = useState(false);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const back = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', escape);
    window.addEventListener('qressi-back', back);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', escape);
      window.removeEventListener('qressi-back', back);
    };
  }, [onClose]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Не удалось выполнить действие.');
    } finally {
      setBusy(false);
    }
  }
  async function exportPng(share = false) {
    const qr = makeQr(entry.data, entry.style, 1200);
    if (!(await checkQr(qr, entry.data, entry.style)))
      throw new Error('Этот стиль не удалось прочитать. Измените оформление перед экспортом.');
    const raw = await qr.getRawData('png');
    if (!(raw instanceof Blob)) throw new Error('Не удалось создать PNG.');
    const filename = `qressi-${Date.now()}.png`;
    if (share) await shareFile(raw, filename);
    else {
      const result = await saveFile(raw, filename, true);
      const message = savedFileMessage(result, 'PNG');
      if (message) notify(message);
    }
  }
  let safeUrl: string | undefined;
  const mapUri = entry.kind === 'geo' ? mapUriFor(entry.data) : undefined;
  try {
    const url = new URL(entry.data);
    if (['https:', 'http:'].includes(url.protocol)) safeUrl = url.href;
  } catch {
    /* Plain text has no open action. */
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dialog detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <div className="dialog-header">
          <span className="eyebrow">
            {LABELS[entry.kind]} ·{' '}
            {entry.source === 'created'
              ? 'СОЗДАНО ТОБОЙ'
              : (entry.codeFormat || 'QR_CODE').replaceAll('_', ' ')}
          </span>
          <Button view="flat" size="l" aria-label="Закрыть результат" onClick={onClose} autoFocus>
            <X size={21} />
          </Button>
        </div>
        {renaming ? (
          <div className="rename-row">
            <TextInput
              size="l"
              value={title}
              onUpdate={setTitle}
              autoFocus
              controlProps={{maxLength: 120, 'aria-label': 'Новое название'}}
            />
            <Button
              view="action"
              size="l"
              disabled={!title.trim() || busy}
              aria-label="Сохранить название"
              onClick={() => {
                void action(async () => {
                  await onUpdate({...entry, title: title.trim()});
                  setRenaming(false);
                });
              }}
            >
              <Check size={18} />
            </Button>
          </div>
        ) : (
          <h2 id="detail-title">
            {entry.title}
            {saved && (
              <button className="inline-icon" onClick={() => setRenaming(true)} aria-label="Переименовать">
                <Pencil size={16} />
              </button>
            )}
          </h2>
        )}
        {entry.codeFormat && entry.codeFormat !== 'QR_CODE' && (
          <p className="hint">
            Исходный формат: {entry.codeFormat.replaceAll('_', ' ')}. Предпросмотр и экспорт — QR с теми же
            данными.
          </p>
        )}
        <QrPreview data={entry.data} style={entry.style} onError={setQrError} />
        <pre className="result-data" tabIndex={0}>
          {entry.data}
        </pre>
        <div className="detail-primary">
          <Button
            view="action"
            size="xl"
            width="max"
            disabled={busy}
            onClick={() => {
              void action(async () => {
                await copyText(entry.data);
                notify('Скопировано');
              });
            }}
          >
            <Copy size={18} /> Копировать
          </Button>
          {mapUri &&
            (Capacitor.getPlatform() === 'android' ? (
              <button
                className="open-link"
                disabled={busy}
                onClick={() => {
                  void action(() => openMap(mapUri));
                }}
              >
                Открыть карту <ArrowUpRight size={18} />
              </button>
            ) : (
              <a className="open-link" href={mapUri}>
                Открыть карту <ArrowUpRight size={18} />
              </a>
            ))}
          {safeUrl && (
            <a className="open-link" href={safeUrl} target="_blank" rel="noopener noreferrer">
              {entry.kind === 'app' ? 'Открыть Google Play' : 'Открыть сайт'} <ArrowUpRight size={18} />
            </a>
          )}
        </div>
        <div className="detail-actions">
          <Button
            view="outlined"
            size="l"
            disabled={busy || qrError}
            onClick={() => {
              void action(() => exportPng());
            }}
          >
            <ArrowDownToLine size={17} /> {Capacitor.isNativePlatform() ? 'Сохранить PNG' : 'Скачать PNG'}
          </Button>
          {Capacitor.isNativePlatform() && (
            <Button
              view="outlined"
              size="l"
              disabled={busy || qrError}
              onClick={() => {
                void action(() => exportPng(true));
              }}
            >
              <Share2 size={17} /> Поделиться PNG
            </Button>
          )}
          <Button view="outlined" size="l" onClick={onEdit}>
            <Palette size={17} /> Изменить
          </Button>
          {saved ? (
            <Button
              view={entry.favorite ? 'normal' : 'outlined'}
              size="l"
              aria-label={entry.favorite ? 'Убрать из избранного' : 'В избранное'}
              disabled={busy}
              onClick={() => {
                void action(() => onUpdate({...entry, favorite: !entry.favorite}));
              }}
            >
              <Heart size={17} fill={entry.favorite ? 'currentColor' : 'none'} />
            </Button>
          ) : (
            <Button
              view="outlined"
              size="l"
              disabled={busy}
              onClick={() => {
                void action(onKeep);
              }}
            >
              В историю
            </Button>
          )}
        </div>
        {saved && (
          <div className="delete-row">
            {deleting ? (
              <>
                <span>Удалить этот код?</span>
                <Button view="flat" size="m" onClick={() => setDeleting(false)}>
                  Отмена
                </Button>
                <Button
                  view="outlined-danger"
                  size="m"
                  disabled={busy}
                  onClick={() => {
                    void action(onDelete);
                  }}
                >
                  Удалить
                </Button>
              </>
            ) : (
              <button className="delete-button" onClick={() => setDeleting(true)}>
                <Trash2 size={15} /> Удалить из истории
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
