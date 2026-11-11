import {Capacitor} from '@capacitor/core';
import {Button, Switch} from '@gravity-ui/uikit';
import {Camera, ImagePlus, Minus, Plus, ScanLine, Square, X, Zap} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {vibrateOnRead} from './cameraViewport';
import {
  cameraError,
  CameraPermissionError,
  ensureCameraPermission,
  openCameraSettings,
  readCodesFromImage,
  startCamera,
  type CameraSession,
} from './scanner';
import type {CodeFormat, Notify, ScannedCode} from './types';

const native = Capacitor.isNativePlatform();

export default function Scan({
  active,
  droppedImage,
  onImageHandled,
  onFound,
  notify,
}: {
  active: boolean;
  droppedImage?: File;
  onImageHandled: () => void;
  onFound: (data: string, save: boolean, format?: CodeFormat) => Promise<void>;
  notify: Notify;
}) {
  const [cameraEnabled, setCameraEnabled] = useState(native);
  const [foreground, setForeground] = useState(!document.hidden);
  const [captured, setCaptured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraIssue, setCameraIssue] = useState('');
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [torch, setTorch] = useState(false);
  const [privateScan, setPrivateScan] = useState(false);
  const [choices, setChoices] = useState<ScannedCode[]>([]);
  const [zoom, setZoom] = useState<CameraSession['zoom']>();
  const zoomPending = useRef<number | undefined>(undefined);
  const zoomUpdating = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const session = useRef<CameraSession | null>(null);
  const foundCallback = useRef(onFound);
  const privateRef = useRef(privateScan);
  const permissionPending = useRef(false);
  const delivering = useRef(false);
  const readingImage = useRef(false);
  foundCallback.current = onFound;
  privateRef.current = privateScan;
  const running = active && foreground && cameraEnabled && !captured && !busy && !choices.length && !droppedImage;

  function openCamera() {
    setCameraIssue('');
    setPermissionBlocked(false);
    setCaptured(false);
    setCameraEnabled(true);
  }

  const deliver = useCallback(async (code: ScannedCode, save: boolean) => {
    if (delivering.current) return;
    delivering.current = true;
    setCaptured(true);
    vibrateOnRead();
    try {
      await foundCallback.current(code.data, save, code.format);
    } finally {
      delivering.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    setCaptured(false);
  }, [active]);

  useEffect(() => {
    const visibility = () => {
      // Android's permission dialog briefly deactivates the activity. Let that
      // request finish before deciding whether the app moved to the background.
      if (!permissionPending.current) setForeground(!document.hidden);
    };
    document.addEventListener('visibilitychange', visibility);
    let disposed = false;
    let removeAppListener: (() => Promise<void>) | undefined;
    if (native)
      void import('@capacitor/app').then(async ({App}) => {
        const handle = await App.addListener('appStateChange', ({isActive}) => {
          if (!permissionPending.current || isActive) setForeground(isActive);
        });
        if (disposed) await handle.remove();
        else removeAppListener = () => handle.remove();
      });
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visibility);
      void removeAppListener?.();
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const back = (event: Event) => {
      if (choices.length) {
        event.preventDefault();
        setChoices([]);
      } else if (cameraEnabled) {
        event.preventDefault();
        setCameraEnabled(false);
      }
    };
    window.addEventListener('qressi-back', back);
    return () => window.removeEventListener('qressi-back', back);
  }, [active, cameraEnabled, choices.length]);

  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    let found = false;
    setStarting(true);
    const opening = (async () => {
      permissionPending.current = native;
      try {
        await ensureCameraPermission();
      } finally {
        permissionPending.current = false;
      }
      if (controller.signal.aborted) return;
      if (document.hidden) {
        setForeground(false);
        return;
      }
      return startCamera(
        videoRef.current,
        (code) => {
          if (found || controller.signal.aborted) return;
          found = true;
          void deliver(code, !privateRef.current);
        },
        (message) => {
          if (controller.signal.aborted) return;
          setCameraIssue(message);
          setCameraEnabled(false);
        },
        controller.signal,
        viewportRef.current,
      );
    })();
    void opening
      .then(async (camera) => {
        if (!camera) return;
        if (controller.signal.aborted) {
          await camera.stop();
          return;
        }
        session.current = camera;
        setTorch(camera.hasTorch);
        setZoom(camera.zoom);
        setReady(true);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setCameraIssue(cameraError(error));
          setPermissionBlocked(error instanceof CameraPermissionError);
          setCameraEnabled(false);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setStarting(false);
      });
    return () => {
      controller.abort();
      session.current = null;
      setReady(false);
      setStarting(false);
      zoomPending.current = undefined;
      void opening.then((camera) => camera?.stop()).catch(() => {});
    };
  }, [running]);

  async function changeZoom(value: number) {
    const camera = session.current;
    if (!camera?.setZoom) return;
    setZoom((old) => (old ? {...old, value} : old));
    zoomPending.current = value;
    if (zoomUpdating.current) return;
    zoomUpdating.current = true;
    try {
      while (zoomPending.current !== undefined && session.current === camera) {
        const next = zoomPending.current;
        zoomPending.current = undefined;
        await camera.setZoom(next);
      }
    } catch {
      notify('Камера не поддерживает выбранный масштаб.');
    } finally {
      zoomUpdating.current = false;
    }
  }

  const readFile = useCallback(
    async (file?: File) => {
      if (!file || readingImage.current) return;
      if (file.size > 20 * 1024 * 1024) {
        notify('Выберите изображение размером до 20 МБ.');
        return;
      }
      readingImage.current = true;
      setChoices([]);
      setBusy(true);
      const save = !privateRef.current;
      try {
        const results = await readCodesFromImage(file);
        if (!results.length) notify('Код не найден. Попробуйте обрезать картинку ближе к нему.');
        else if (results.length === 1) await deliver(results[0], save);
        else setChoices(results);
      } catch (error) {
        notify(cameraError(error));
      } finally {
        readingImage.current = false;
        setBusy(false);
      }
    },
    [deliver, notify],
  );

  useEffect(() => {
    if (!active || busy || !droppedImage) return;
    onImageHandled();
    void readFile(droppedImage);
  }, [active, busy, droppedImage, onImageHandled, readFile]);

  useEffect(() => {
    if (!active) return;
    const paste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files || []).find((f) => f.type.startsWith('image/'));
      if (file) {
        event.preventDefault();
        void readFile(file);
      }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [active, readFile]);

  return (
    <section className="page scan-page" aria-label="Сканировать QR">
      <div className="page-heading">
        <h1>Сканировать</h1>
      </div>
      <div className="scan-layout">
        <div className="scan-camera-column">
          <div
            className="scan-window"
            ref={viewportRef}
            aria-label="Окно камеры"
            onDragOver={native ? (event) => event.preventDefault() : undefined}
            onDrop={
              native
                ? (event) => {
                    event.preventDefault();
                    void readFile(event.dataTransfer.files[0]);
                  }
                : undefined
            }
          >
            {!native && <video ref={videoRef} muted playsInline autoPlay aria-hidden={!running} />}
            {running ? (
              <div className="inline-camera-overlay">
                <span className="camera-status">
                  <i />
                  {ready ? 'Наведите на код' : 'Открываем камеру…'}
                </span>
                <div className="viewfinder">
                  <i />
                  <i />
                  <i />
                  <i />
                  <div className="scan-beam" />
                </div>
              </div>
            ) : (
              <button
                className="scan-placeholder"
                disabled={busy}
                onClick={openCamera}
                aria-label="Включить камеру"
              >
                <ScanLine size={76} strokeWidth={1} />
                <span>{busy ? 'Читаем изображение…' : 'Камера выключена'}</span>
              </button>
            )}
          </div>
          <div className="camera-tools" aria-label="Управление камерой">
            {zoom && (
              <div className="zoom-control">
                <button
                  aria-label="Уменьшить масштаб"
                  disabled={!ready || zoom.value <= zoom.min}
                  onClick={() => void changeZoom(Math.max(zoom.min, zoom.value - 0.5))}
                >
                  <Minus size={18} />
                </button>
                <input
                  type="range"
                  disabled={!ready}
                  aria-label="Масштаб камеры"
                  min={zoom.min}
                  max={zoom.max}
                  step={Math.max(0.01, zoom.step)}
                  value={zoom.value}
                  onChange={(event) => void changeZoom(Number(event.target.value))}
                />
                <output>{zoom.value.toLocaleString('ru-RU', {maximumFractionDigits: 1})}×</output>
                <button
                  aria-label="Увеличить масштаб"
                  disabled={!ready || zoom.value >= zoom.max}
                  onClick={() => void changeZoom(Math.min(zoom.max, zoom.value + 0.5))}
                >
                  <Plus size={18} />
                </button>
              </div>
            )}
            {torch && (
              <Button
                view="outlined"
                size="l"
                disabled={!ready}
                onClick={() => void session.current?.toggleTorch().catch(() => notify('Фонарик недоступен.'))}
              >
                <Zap size={18} /> Фонарик
              </Button>
            )}
          </div>
        </div>
        <div className="scan-actions">
          <Button
            view={cameraEnabled ? 'outlined' : 'action'}
            size="xl"
            width="max"
            disabled={busy}
            onClick={() => (cameraEnabled ? setCameraEnabled(false) : openCamera())}
          >
            {cameraEnabled ? (
              <>
                <Square size={18} />
                {starting ? 'Отменить запуск' : 'Остановить камеру'}
              </>
            ) : (
              <>
                <Camera size={20} /> Включить камеру
              </>
            )}
          </Button>
          <Button
            view="outlined"
            size="xl"
            width="max"
            onClick={() => inputRef.current?.click()}
            loading={busy}
          >
            <ImagePlus size={20} /> Выбрать изображение
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              void readFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <p className="hint desktop-hint">
            {native
              ? 'Или перетащите картинку сюда / вставьте из буфера'
              : 'Или перетащите изображение на страницу / вставьте из буфера'}
          </p>
          {cameraIssue && (
            <div className="camera-error" role="alert">
              <p>{cameraIssue}</p>
              {permissionBlocked && (
                <Button
                  view="outlined"
                  size="l"
                  onClick={() =>
                    void openCameraSettings().catch(() => notify('Не удалось открыть настройки камеры.'))
                  }
                >
                  Настройки разрешений
                </Button>
              )}
            </div>
          )}
          <div className="privacy-row">
            <div>
              <strong>Сохранять в историю</strong>
              <span>Для камеры и изображений</span>
            </div>
            <Switch
              checked={!privateScan}
              onUpdate={(save) => setPrivateScan(!save)}
              aria-label="Сохранять результаты в историю"
              size="l"
            />
          </div>
        </div>
      </div>
      {choices.length > 0 && (
        <div className="modal-backdrop">
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="choices-title">
            <div className="dialog-header">
              <h2 id="choices-title">Найдено несколько кодов</h2>
              <Button view="flat" aria-label="Закрыть" onClick={() => setChoices([])}>
                <X />
              </Button>
            </div>
            {choices.map((code, i) => (
              <button
                className="choice-result"
                key={i}
                onClick={() => {
                  setChoices([]);
                  void deliver(code, !privateRef.current);
                }}
              >
                <small>{code.format.replaceAll('_', ' ')}</small>
                {code.data.slice(0, 130)}
              </button>
            ))}
          </section>
        </div>
      )}
    </section>
  );
}
