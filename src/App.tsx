import {Capacitor} from '@capacitor/core';
import {Button} from '@gravity-ui/uikit';
import {Check, Clock3, ImagePlus, Info, Plus, ScanLine, X} from 'lucide-react';
import {lazy, Suspense, useCallback, useEffect, useRef, useState} from 'react';
import {makeEntry, mergeEntry} from './data';
import {EditorScreen, isEditorScreen, separateEditor, type EditorLaunch} from './editorScreen';
import {loadHistory, saveHistory} from './storage';
import type {CodeFormat, EditorDraft, Entry, Tab} from './types';
import {useImageDrop} from './useImageDrop';

const Create = lazy(() => import('./Create'));
const Detail = lazy(() => import('./Detail'));
const History = lazy(() => import('./History'));
const PrivacyDocument = lazy(() => import('./PrivacyDocument'));
const Scan = lazy(() => import('./Scan'));
const TABS = [
  {id: 'scan', title: 'Сканировать', icon: ScanLine},
  {id: 'create', title: 'Создать QR', icon: Plus},
  {id: 'history', title: 'История', icon: Clock3},
] as const;
type ToastAction = {label: string; onClick: () => void};
const web = Capacitor.getPlatform() === 'web';

export default function App({editorLaunch}: {editorLaunch?: EditorLaunch}) {
  const homeTab = web ? 'create' : 'scan';
  const initialTab = isEditorScreen ? 'create' : editorLaunch?.tab || homeTab;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [visited, setVisited] = useState<Tab[]>([initialTab]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const storageStatus = useRef<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<Entry>();
  const [editing, setEditing] = useState<Entry | undefined>(editorLaunch?.entry);
  const [editorOpening, setEditorOpening] = useState(false);
  const openingEditor = useRef(false);
  const requestedEntry = useRef<Entry | undefined>(undefined);
  const closingEditor = useRef(false);
  const editorDraft = useRef<EditorDraft | undefined>(editorLaunch?.draft);
  const rememberDraft = useCallback((draft: EditorDraft) => {
    editorDraft.current = draft;
  }, []);
  const [editorKey, setEditorKey] = useState(0);
  const [toast, setToast] = useState('');
  const [toastAction, setToastAction] = useState<ToastAction>();
  const [about, setAbout] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [droppedImage, setDroppedImage] = useState<File>();
  const toastTimer = useRef(0);
  const loading = useRef<Promise<void> | null>(null);
  const mutation = useRef(Promise.resolve());
  const notify = useCallback((message: string, action?: ToastAction) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    setToastAction(action);
    toastTimer.current = window.setTimeout(
      () => {
        setToast('');
        setToastAction(undefined);
      },
      action ? 8000 : 5500,
    );
  }, []);
  const refreshHistory = useCallback(() => {
    storageStatus.current = 'loading';
    const refresh = loadHistory()
      .then((items) => {
        entriesRef.current = items;
        storageStatus.current = 'ready';
        setEntries(items);
      })
      .catch((error) => {
        storageStatus.current = 'error';
        throw error;
      });
    loading.current = refresh;
    return refresh;
  }, []);
  const navigate = useCallback(
    (next: Tab, entry?: Entry) => {
      if (isEditorScreen && next !== 'create') {
        if (closingEditor.current) return;
        closingEditor.current = true;
        void (async () => {
          await loading.current?.catch(() => {});
          await mutation.current.catch(() => {});
          await EditorScreen.close({tab: next, draft: editorDraft.current});
        })()
          .catch(() => notify('Не удалось закрыть редактор. Попробуйте ещё раз.'))
          .finally(() => {
            closingEditor.current = false;
          });
        return;
      }
      if (separateEditor && !isEditorScreen && next === 'create') {
        if (openingEditor.current) return;
        openingEditor.current = true;
        requestedEntry.current = entry;
        setEditorOpening(true);
        return;
      }
      setTab(next);
      setVisited((old) => (old.includes(next) ? old : [...old, next]));
    },
    [notify],
  );
  const openDroppedImage = useCallback(
    (file: File) => {
      setSelected(undefined);
      setAbout(false);
      setPrivacy(false);
      setDroppedImage(file);
      navigate('scan');
    },
    [navigate],
  );
  const invalidDrop = useCallback(() => notify('Перетащите файл изображения с QR-кодом.'), [notify]);
  const clearDroppedImage = useCallback(() => setDroppedImage(undefined), []);
  const draggingImage = useImageDrop(web, openDroppedImage, invalidDrop);

  useEffect(() => {
    if (!editorOpening) return;
    void (async () => {
      let target: Tab = 'scan';
      try {
        // Scan's cleanup runs in the same commit, before this session closes.
        // The editor never shares a live camera or its rendering surface.
        await loading.current;
        await mutation.current.catch(() => {});
        const {waitForCameraStop} = await import('./scanner');
        await waitForCameraStop();
        target = (await EditorScreen.open({entry: requestedEntry.current})).tab;
        setTab(target);
        setVisited((old) => (old.includes(target) ? old : [...old, target]));
        // Preferences is shared by the two activities; refresh before allowing
        // another mutation so a newly saved QR cannot be overwritten.
        await refreshHistory();
      } catch {
        storageStatus.current = 'error';
        notify('Не удалось открыть редактор или обновить историю. Перезапустите приложение.');
      } finally {
        requestedEntry.current = undefined;
        openingEditor.current = false;
        setTab(target);
        setVisited((old) => (old.includes(target) ? old : [...old, target]));
        setEditorOpening(false);
      }
    })();
  }, [editorOpening, notify, refreshHistory]);

  useEffect(() => {
    if (!isEditorScreen) return;
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    void EditorScreen.addListener('opened', ({entry}) => {
      if (disposed) return;
      if (entry) {
        setEditing(entry);
        setEditorKey((key) => key + 1);
      }
      void refreshHistory().catch(() => notify('Не удалось обновить историю. Перезапустите приложение.'));
    })
      .then((listener) => {
        if (disposed) void listener.remove();
        else remove = () => listener.remove();
      })
      .catch(() => notify('Не удалось подготовить повторное открытие редактора.'));
    return () => {
      disposed = true;
      void remove?.();
    };
  }, [notify, refreshHistory]);

  useEffect(() => {
    void refreshHistory()
      .catch(() => {
        storageStatus.current = 'error';
        notify('Не удалось прочитать историю. Существующие данные не перезаписаны.');
      })
      .finally(() => setLoaded(true));
    return () => clearTimeout(toastTimer.current);
  }, [notify, refreshHistory]);

  const updateHistory = useCallback((transform: (entries: Entry[]) => Entry[]) => {
    const next = mutation.current
      .catch(() => {})
      .then(async () => {
        await loading.current;
        // A failed read must never overwrite the user's existing data.
        if (storageStatus.current !== 'ready')
          throw new Error('История недоступна. Перезапустите приложение.');
        const items = transform(entriesRef.current);
        await saveHistory(items);
        entriesRef.current = items;
        setEntries(items);
      });
    mutation.current = next;
    return next;
  }, []);

  const add = useCallback(
    async (entry: Entry) => {
      await updateHistory((items) => mergeEntry(items, entry));
    },
    [updateHistory],
  );
  const deleteHistoryEntry = useCallback(
    async (id: string) => {
      let removed: Entry | undefined;
      let index = 0;
      await updateHistory((items) => {
        index = items.findIndex((item) => item.id === id);
        if (index < 0) return items;
        removed = items[index];
        return items.filter((item) => item.id !== id);
      });
      if (!removed) return;
      const entry = removed;
      notify('Код удалён', {
        label: 'Отменить',
        onClick: () => {
          void updateHistory((items) => {
            if (items.some((item) => item.id === entry.id)) return items;
            const restored = [...items];
            restored.splice(Math.min(Math.max(index, 0), restored.length), 0, entry);
            return restored.slice(0, 1000);
          })
            .then(() => notify('Удаление отменено'))
            .catch(() => notify('Не удалось восстановить код. Попробуйте ещё раз.'));
        },
      });
    },
    [notify, updateHistory],
  );
  const scanFound = useCallback(
    async (data: string, save: boolean, format: CodeFormat = 'QR_CODE') => {
      const entry = makeEntry(data, 'scanned', undefined, undefined, format);
      if (save) {
        try {
          await add(entry);
          notify('Код сохранён в историю');
        } catch (error) {
          notify(`Код прочитан, но не сохранён: ${error instanceof Error ? error.message : 'ошибка записи'}`);
        }
      } else notify('Код прочитан без сохранения');
      setSelected(entry);
    },
    [add, notify],
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    import('@capacitor/app').then(async ({App}) => {
      const listener = await App.addListener('backButton', () => {
        const event = new Event('qressi-back', {cancelable: true});
        if (!window.dispatchEvent(event)) return;
        if (about) setAbout(false);
        else if (tab !== 'scan') navigate('scan');
        else void App.minimizeApp();
      });
      if (disposed) await listener.remove();
      else remove = () => listener.remove();
    });
    return () => {
      disposed = true;
      void remove?.();
    };
  }, [about, navigate, tab]);

  const current =
    selected &&
    (entries.find(
      (entry) =>
        entry.data === selected.data &&
        entry.source === selected.source &&
        (entry.codeFormat || 'QR_CODE') === (selected.codeFormat || 'QR_CODE'),
    ) ||
      selected);
  const saved = !!current && entries.some((entry) => entry.id === current.id);
  const closeDetail = useCallback(() => setSelected(undefined), []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate(homeTab);
          }}
          aria-label="QRessi — главная"
        >
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} width="38" height="38" alt="" />
          <span>
            QR<span className="brand-light">essi</span>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="Основная навигация">
          {TABS.map(({id, title, icon: Icon}) => (
            <button
              key={id}
              className={tab === id ? 'active' : ''}
              onClick={() => navigate(id)}
              aria-current={tab === id ? 'page' : undefined}
            >
              <Icon size={17} />
              {title}
            </button>
          ))}
        </nav>
        <Button view="flat" size="l" aria-label="О приложении" onClick={() => setAbout(true)}>
          <Info size={20} />
        </Button>
      </header>
      <main>
        <Suspense
          fallback={
            <div className="page-loading">
              <span className="loading-dot" />
              Один момент…
            </div>
          }
        >
          <div hidden={tab !== 'scan'}>
            {visited.includes('scan') && (
              <Scan
                active={tab === 'scan' && !editorOpening && !current && !about}
                droppedImage={droppedImage}
                onImageHandled={clearDroppedImage}
                onFound={scanFound}
                notify={notify}
              />
            )}
          </div>
          <div hidden={tab !== 'create'}>
            {(!separateEditor || isEditorScreen) && visited.includes('create') && (
              <Create
                key={editorKey}
                initial={editing}
                draft={editorLaunch?.draft}
                onDraftChange={isEditorScreen ? rememberDraft : undefined}
                onSave={add}
                notify={notify}
              />
            )}
          </div>
          <div hidden={tab !== 'history'}>
            {visited.includes('history') && (
              <History
                entries={entries}
                loaded={loaded}
                onSelect={setSelected}
                onImport={(items) => updateHistory((old) => items.reduce(mergeEntry, old))}
                onDelete={deleteHistoryEntry}
                notify={notify}
              />
            )}
          </div>
        </Suspense>
      </main>
      <nav className="bottom-nav" aria-label="Навигация">
        {TABS.map(({id, title, icon: Icon}) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => navigate(id)}
            aria-current={tab === id ? 'page' : undefined}
          >
            <span>
              <Icon size={22} />
            </span>
            {title}
          </button>
        ))}
      </nav>
      {draggingImage && (
        <div className="image-drop-overlay" aria-hidden="true">
          <div>
            <ImagePlus size={38} />
            <strong>Отпустите изображение с QR</strong>
            <span>QRessi прочитает код</span>
          </div>
        </div>
      )}
      {current && (
        <Suspense fallback={null}>
          <Detail
            key={current.id}
            entry={current}
            saved={saved}
            onClose={closeDetail}
            onUpdate={(entry) =>
              updateHistory((items) => items.map((item) => (item.id === entry.id ? entry : item)))
            }
            onDelete={async () => {
              await deleteHistoryEntry(current.id);
              setSelected(undefined);
            }}
            onEdit={() => {
              setEditing(current);
              setEditorKey((key) => key + 1);
              setSelected(undefined);
              navigate('create', current);
            }}
            onKeep={async () => {
              await add(current);
              notify('Сохранено в историю');
            }}
            notify={notify}
          />
        </Suspense>
      )}
      {about && (
        <div className="modal-backdrop">
          <section
            className="dialog about-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
          >
            <div className="dialog-header">
              <span className="eyebrow">О ПРИЛОЖЕНИИ</span>
              <Button view="flat" aria-label="Закрыть" onClick={() => setAbout(false)} autoFocus>
                <X />
              </Button>
            </div>
            <img src={`${import.meta.env.BASE_URL}icon-192.png`} width="72" height="72" alt="" />
            <h2 id="about-title">QRessi</h2>
            <p>Создание QR и сканирование кодов.</p>
            <ul className="about-features">
              <li>
                <Check size={17} />
                Работает без аккаунта и интернета
              </li>
              <li>
                <Check size={17} />
                Обрабатывает картинки на устройстве
              </li>
              <li>
                <Check size={17} />
                Хранит историю только здесь
              </li>
            </ul>
            <p className="hint">
              Создание QR, сканирование и история доступны офлайн. Для открытия сайтов нужен интернет. В
              браузере история может исчезнуть при очистке данных сайта — сохраняйте резервную копию.
            </p>
            <p className="hint">
              Android-сканер использует Google ML Kit: изображения обрабатываются на устройстве, SDK может
              отправлять Google технические метрики.
            </p>
            <Button
              view="outlined"
              onClick={() => {
                setAbout(false);
                setPrivacy(true);
              }}
            >
              Конфиденциальность
            </Button>
            <div className="about-version">Версия 0.9.0</div>
          </section>
        </div>
      )}
      {privacy && (
        <Suspense fallback={null}>
          <PrivacyDocument
            onClose={() => {
              setPrivacy(false);
              setAbout(true);
            }}
          />
        </Suspense>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          {toastAction && (
            <button className="toast-undo" onClick={toastAction.onClick}>
              {toastAction.label}
            </button>
          )}
          <button onClick={() => setToast('')} aria-label="Закрыть уведомление">
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
