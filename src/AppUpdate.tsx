import {Capacitor, registerPlugin} from '@capacitor/core';
import {Button} from '@gravity-ui/uikit';
import {useCallback, useEffect, useRef, useState} from 'react';
import type {Notify} from './types';

type UpdateState = {
  state: 'idle' | 'available' | 'downloading' | 'ready';
  version?: string;
  progress?: number;
  error?: string;
};
const AppUpdate = registerPlugin<{
  check: (options: {force: boolean}) => Promise<UpdateState>;
  status: () => Promise<UpdateState>;
  download: () => Promise<UpdateState>;
  cancel: () => Promise<UpdateState>;
  install: () => Promise<void>;
}>('AppUpdate');

export default function AppUpdateNotice({
  hidden,
  checkRequest,
  notify,
}: {
  hidden: boolean;
  checkRequest: number;
  notify: Notify;
}) {
  const [update, setUpdate] = useState<UpdateState>({state: 'idle'});
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');
  const [foreground, setForeground] = useState(!document.hidden);
  const checked = useRef(false);
  const checking = useRef(false);
  const accepted = useRef(false);
  const installPending = useRef(false);
  const lastCheck = useRef(0);

  const check = useCallback(
    async (force: boolean) => {
      if (checking.current) return;
      checked.current = true;
      checking.current = true;
      if (force) notify('Проверяем обновления…');
      try {
        const next = await AppUpdate.check({force});
        setUpdate(next);
        setDismissed(false);
        setError(next.error || '');
        if (force) notify(next.state === 'idle' ? 'Установлена актуальная версия QRessi.' : '');
      } catch {
        if (force) notify('Не удалось проверить обновления. Проверьте подключение к интернету.');
      } finally {
        checking.current = false;
        lastCheck.current = Date.now();
      }
    },
    [notify],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!checked.current) void check(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [check]);

  useEffect(() => {
    if (checkRequest) void check(true);
  }, [check, checkRequest]);

  useEffect(() => {
    const visible = (active: boolean) => {
      setForeground(active);
      if (active && Date.now() - lastCheck.current >= 24 * 60 * 60 * 1000) void check(false);
    };
    const changed = () => visible(!document.hidden);
    document.addEventListener('visibilitychange', changed);
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    if (Capacitor.getPlatform() === 'android') {
      void import('@capacitor/app')
        .then(async ({App}) => {
          const listener = await App.addListener('appStateChange', ({isActive}) => visible(isActive));
          if (disposed) await listener.remove();
          else remove = () => listener.remove();
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', changed);
      void remove?.();
    };
  }, [check]);

  useEffect(() => {
    if (update.state !== 'downloading' || !foreground) return;
    let disposed = false;
    let timer = 0;
    const poll = async () => {
      try {
        const next = await AppUpdate.status();
        if (disposed) return;
        setUpdate(next);
        setError(next.error || '');
        if (next.state !== 'downloading') return;
      } catch {
        if (disposed) return;
      }
      timer = window.setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [foreground, update.state]);

  const install = useCallback(async () => {
    if (installPending.current) return;
    accepted.current = false;
    installPending.current = true;
    setInstalling(true);
    setError('');
    try {
      await AppUpdate.install();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Не удалось открыть установку.';
      setError(message);
      await AppUpdate.status()
        .then(setUpdate)
        .catch(() => {});
    } finally {
      installPending.current = false;
      setInstalling(false);
    }
  }, []);

  useEffect(() => {
    if (update.state === 'ready' && accepted.current && foreground && !hidden) void install();
  }, [foreground, hidden, install, update.state]);

  async function download() {
    setBusy(true);
    setError('');
    accepted.current = true;
    try {
      const next = await AppUpdate.download();
      setUpdate(next);
      setError(next.error || '');
    } catch (cause) {
      accepted.current = false;
      setError(cause instanceof Error ? cause.message : 'Не удалось скачать обновление.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    accepted.current = false;
    try {
      await AppUpdate.cancel();
      setUpdate({state: 'idle'});
    } catch {
      setError('Не удалось отменить загрузку. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  if (hidden || dismissed || update.state === 'idle') return null;
  const downloading = update.state === 'downloading';
  return (
    <aside className="app-update" aria-label="Обновление QRessi">
      <p role="status">
        {installing
          ? 'Открываем установку…'
          : downloading
            ? `Скачиваем QRessi ${update.version}… ${update.progress || 0}%`
            : update.state === 'ready'
              ? `Версия ${update.version} скачана. Установить?`
              : `Доступна версия ${update.version}. Обновить?`}
      </p>
      {error && (
        <p className="app-update-error" role="alert">
          {error}
        </p>
      )}
      {downloading && <progress aria-label="Загрузка обновления" max={100} value={update.progress || 0} />}
      <div className="app-update-actions">
        {downloading ? (
          <Button view="flat" size="l" disabled={busy} onClick={() => void cancel()}>
            Отменить
          </Button>
        ) : (
          <>
            <Button
              view="action"
              size="l"
              disabled={busy || installing}
              onClick={() => void (update.state === 'ready' ? install() : download())}
            >
              {update.state === 'ready' ? 'Установить' : error ? 'Повторить' : 'Обновить'}
            </Button>
            <Button
              view="flat"
              size="l"
              disabled={busy || installing}
              onClick={() => {
                accepted.current = false;
                setDismissed(true);
              }}
            >
              Позже
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}
