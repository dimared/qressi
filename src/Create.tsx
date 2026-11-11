import {Capacitor} from '@capacitor/core';
import {Button, Select, TextArea, TextInput} from '@gravity-ui/uikit';
import {
  ArrowDownToLine,
  AtSign,
  Check,
  CheckCheck,
  ClipboardPaste,
  ContactRound,
  FileText,
  ImagePlus,
  Info,
  Link,
  LocateFixed,
  MapPin,
  Palette,
  Phone,
  QrCode,
  Save,
  Share2,
  ShieldCheck,
  Smartphone,
  Wifi,
  X,
} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';
import ColorPicker from './ColorPicker';
import {styleContrast, transparentMatte} from './colors';
import {escapeVcard, escapeWifi, makeEntry} from './data';
import {checkQr, makeQr} from './qr';
import QrPreview from './QrPreview';
import AppPicker from './AppPicker';
import {currentCoordinates} from './device';
import FormatInfo from './FormatInfo';
import PaintEditor from './PaintEditor';
import {readClipboard, savedFileMessage, saveFile, shareFile} from './storage';
import {
  DEFAULT_STYLE,
  LABELS,
  type ContentKind,
  type EditorDraft,
  type Entry,
  type Notify,
  type QrStyle,
} from './types';

const KINDS = [
  {id: 'text', icon: FileText},
  {id: 'url', icon: Link},
  {id: 'wifi', icon: Wifi},
  {id: 'contact', icon: ContactRound},
  {id: 'email', icon: AtSign},
  {id: 'phone', icon: Phone},
  {id: 'geo', icon: MapPin},
  {id: 'app', icon: Smartphone},
] as const;

export default function Create({
  initial,
  draft,
  onDraftChange,
  onSave,
  notify,
}: {
  initial?: Entry;
  draft?: EditorDraft;
  onDraftChange?: (draft: EditorDraft) => void;
  onSave: (entry: Entry) => Promise<void>;
  notify: Notify;
}) {
  const restored = initial ? undefined : draft;
  const [kind, setKind] = useState<ContentKind>(restored?.kind || 'text');
  const [values, setValues] = useState<Record<string, string>>(
    restored?.values || {raw: initial?.data || '', encryption: 'WPA'},
  );
  const [name, setName] = useState(initial?.title || restored?.name || '');
  const [style, setStyle] = useState<QrStyle>(initial?.style || restored?.style || DEFAULT_STYLE);
  const [centerMode, setCenterMode] = useState<'none' | 'image' | 'text'>(
    restored?.centerMode || (initial?.style?.centerText ? 'text' : initial?.style?.logo ? 'image' : 'none'),
  );
  const [textColorPicker, setTextColorPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrError, setQrError] = useState(false);
  const [formatInfo, setFormatInfo] = useState(false);
  const [appPicker, setAppPicker] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number>();
  const [exporting, setExporting] = useState<'png' | 'svg' | 'share'>();
  const [checked, setChecked] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onDraftChange?.({kind, values, name, style, centerMode});
  }, [kind, values, name, style, centerMode, onDraftChange]);
  const update = (key: string, value: string) => {
    setValues((old) => ({...old, [key]: value}));
    setChecked(false);
  };
  const updateStyle = (patch: Partial<QrStyle>) => {
    setStyle((old) => ({...old, ...patch}));
    setChecked(false);
  };
  const {data, error} = useMemo(() => {
    const raw = values.raw?.trim() || '';
    switch (kind) {
      case 'url': {
        if (!raw) return {data: '', error: ''};
        try {
          const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
          if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) throw new Error();
          return {data: url.href, error: ''};
        } catch {
          return {data: '', error: 'Введите адрес сайта, например example.com'};
        }
      }
      case 'geo': {
        const latitude = values.latitude?.trim().replace(',', '.') || '';
        const longitude = values.longitude?.trim().replace(',', '.') || '';
        if (!latitude || !longitude) return {data: '', error: ''};
        const lat = Number(latitude),
          lon = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
          return {data: '', error: 'Широта: от −90 до 90; долгота: от −180 до 180.'};
        return {data: `geo:${lat},${lon}`, error: ''};
      }
      case 'app': {
        let packageName = (values.appPackage || '').trim();
        if (!packageName) return {data: '', error: ''};
        if (packageName.includes('://')) {
          try {
            const url = new URL(packageName);
            if (url.hostname !== 'play.google.com' || url.pathname !== '/store/apps/details')
              throw new Error();
            packageName = url.searchParams.get('id') || '';
          } catch {
            return {data: '', error: 'Укажите ссылку Google Play или имя пакета приложения.'};
          }
        }
        if (!/^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+$/.test(packageName))
          return {data: '', error: 'Имя пакета выглядит так: com.example.app'};
        return {
          data: `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`,
          error: '',
        };
      }
      case 'wifi':
        return {
          data: values.ssid
            ? `WIFI:T:${values.encryption || 'WPA'};S:${escapeWifi(values.ssid)};P:${values.encryption === 'nopass' ? '' : escapeWifi(values.password || '')};;`
            : '',
          error: '',
        };
      case 'contact':
        return {
          data: values.contactName?.trim()
            ? [
                'BEGIN:VCARD',
                'VERSION:3.0',
                `FN:${escapeVcard(values.contactName.trim())}`,
                values.contactPhone ? `TEL:${escapeVcard(values.contactPhone)}` : '',
                values.contactEmail ? `EMAIL:${escapeVcard(values.contactEmail)}` : '',
                'END:VCARD',
              ]
                .filter(Boolean)
                .join('\r\n')
            : '',
          error: '',
        };
      case 'email':
        return {
          data: raw ? `mailto:${raw}` : '',
          error: raw && !/^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(raw) ? 'Проверьте адрес электронной почты' : '',
        };
      case 'phone':
        return {
          data: raw ? `tel:${raw.replace(/[ ()-]/g, '')}` : '',
          error: raw && !/^\+?[\d ()-]{3,30}$/.test(raw) ? 'Проверьте номер телефона' : '',
        };
      default:
        return {data: values.raw || '', error: ''};
    }
  }, [kind, values]);
  const lowContrast = styleContrast(style) < 4.5;
  const disabled = !data || !!error || qrError || busy;

  async function prepare() {
    if (!data || error) throw new Error(error || 'Добавьте содержимое QR.');
    const qr = makeQr(data, style, 1200);
    if (!(await checkQr(qr, data, style)))
      throw new Error(
        'Не удалось прочитать этот стиль. Уменьшите логотип или выберите более контрастные цвета.',
      );
    setChecked(true);
    return qr;
  }

  async function act(action: 'save' | 'png' | 'svg' | 'share' | 'check') {
    setBusy(true);
    if (action === 'png' || action === 'svg' || action === 'share') setExporting(action);
    try {
      const qr = await prepare();
      if (action === 'png' || action === 'svg' || action === 'share') {
        const format = action === 'svg' ? 'svg' : 'png';
        const blob = await qr.getRawData(format);
        if (!(blob instanceof Blob)) throw new Error('Не удалось создать файл.');
        const filename = `qressi-${Date.now()}.${format}`;
        if (action === 'share') await shareFile(blob, filename);
        else {
          const result = await saveFile(blob, filename, action === 'png');
          const message = savedFileMessage(result, format.toUpperCase());
          if (message) notify(message);
        }
      } else if (action === 'save') {
        await onSave(makeEntry(data, 'created', name, style));
        notify('QR сохранён в историю');
      } else notify('QR успешно читается. При печати сохраняйте поля вокруг кода.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Не удалось подготовить QR.');
    } finally {
      setBusy(false);
      setExporting(undefined);
    }
  }

  async function addLogo(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      notify('Выберите PNG, JPEG или WebP до 5 МБ.');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
      const scale = Math.min(1, 192 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      updateStyle({logo: canvas.toDataURL('image/png'), centerText: undefined});
      setCenterMode('image');
    } catch {
      notify('Не удалось открыть логотип.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const field = (
    key: string,
    label: string,
    placeholder: string,
    type: 'text' | 'password' | 'email' | 'tel' | 'url' = 'text',
  ) => (
    <label className="field">
      <span>{label}</span>
      <TextInput
        size="xl"
        value={values[key] || ''}
        onUpdate={(value) => update(key, value)}
        placeholder={placeholder}
        type={type}
        autoComplete="off"
        controlProps={{'aria-label': label, maxLength: key === 'raw' ? 4000 : 250}}
      />
    </label>
  );

  return (
    <section className="page create-page" aria-label="Создать QR">
      <div className="page-heading">
        <h1>Создать QR</h1>
        {Capacitor.getPlatform() === 'web' && (
          <p className="hint desktop-hint">Чтобы прочитать QR, перетащите его изображение на страницу.</p>
        )}
      </div>
      <div className="editor-layout">
        <section className="card content-card">
          <div className="section-label">
            <span className="step">01</span>
            <h2>Содержимое</h2>
            <Button
              view="flat"
              size="m"
              className="clipboard-action"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  try {
                    const text = await readClipboard();
                    if (!text) {
                      notify('В буфере нет текста.');
                      return;
                    }
                    if (text.length > 4000) {
                      notify('В буфере слишком много текста для одного QR.');
                      return;
                    }
                    setKind(/^https?:\/\//i.test(text.trim()) ? 'url' : 'text');
                    update('raw', text);
                  } catch {
                    notify('Не удалось прочитать буфер. Вставьте текст в поле вручную.');
                  }
                })();
              }}
            >
              <ClipboardPaste size={16} /> Из буфера
            </Button>
          </div>
          <div className="kind-grid" role="group" aria-label="Тип содержимого">
            {KINDS.map(({id, icon: Icon}) => (
              <button
                key={id}
                className={`kind-button ${kind === id ? 'selected' : ''}`}
                aria-pressed={kind === id}
                onClick={() => {
                  setKind(id);
                  setChecked(false);
                }}
              >
                <Icon size={20} />
                <span>{LABELS[id]}</span>
              </button>
            ))}
          </div>
          {kind === 'text' ? (
            <label className="field">
              <span>Текст</span>
              <TextArea
                size="xl"
                rows={4}
                value={values.raw || ''}
                onUpdate={(value) => update('raw', value)}
                placeholder="Введите текст"
                controlProps={{'aria-label': 'Текст QR-кода', maxLength: 4000}}
              />
            </label>
          ) : kind === 'wifi' ? (
            <>
              {field('ssid', 'Название сети', 'Мой уютный Wi-Fi')}
              <label className="field">
                <span>Защита</span>
                <Select
                  size="xl"
                  width="max"
                  value={[values.encryption || 'WPA']}
                  onUpdate={([value]) => update('encryption', value)}
                  options={[
                    {value: 'WPA', content: 'WPA / WPA2 / WPA3 Personal'},
                    {value: 'WEP', content: 'WEP'},
                    {value: 'nopass', content: 'Без пароля'},
                  ]}
                />
              </label>
              {values.encryption !== 'nopass' && field('password', 'Пароль сети', 'Пароль', 'password')}
            </>
          ) : kind === 'geo' ? (
            <>
              <div className="coordinate-fields">
                {field('latitude', 'Широта', '55.751244')}
                {field('longitude', 'Долгота', '37.618423')}
              </div>
              <Button
                view="outlined"
                size="l"
                loading={locationBusy}
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    setLocationBusy(true);
                    try {
                      const coords = await currentCoordinates();
                      setValues((old) => ({
                        ...old,
                        latitude: coords.latitude.toFixed(6),
                        longitude: coords.longitude.toFixed(6),
                      }));
                      setLocationAccuracy(coords.accuracy);
                      setChecked(false);
                    } catch {
                      notify(
                        'Не удалось определить местоположение. Проверьте разрешение и GPS или введите координаты.',
                      );
                    } finally {
                      setLocationBusy(false);
                    }
                  })();
                }}
              >
                <LocateFixed size={17} /> Мои координаты
              </Button>
              {locationAccuracy !== undefined && (
                <p className="hint">Точность определения: около {Math.round(locationAccuracy)} м.</p>
              )}
            </>
          ) : kind === 'app' ? (
            <>
              {field('appPackage', 'Ссылка Google Play или имя пакета', 'com.example.app')}
              {Capacitor.getPlatform() === 'android' && (
                <Button view="outlined" size="l" onClick={() => setAppPicker(true)}>
                  <Smartphone size={17} /> Выбрать на устройстве
                </Button>
              )}
              <p className="hint">В QR будет ссылка на страницу приложения в Google Play.</p>
            </>
          ) : kind === 'contact' ? (
            <>
              {field('contactName', 'Имя', 'Как вас зовут?')}
              {field('contactPhone', 'Телефон', '+7 999 123-45-67', 'tel')}
              {field('contactEmail', 'Почта', 'hello@example.com', 'email')}
            </>
          ) : (
            field(
              'raw',
              kind === 'url' ? 'Адрес сайта' : kind === 'email' ? 'Электронная почта' : 'Номер телефона',
              kind === 'url'
                ? 'https://example.com'
                : kind === 'email'
                  ? 'hello@example.com'
                  : '+7 999 123-45-67',
              kind === 'url' ? 'url' : kind === 'email' ? 'email' : 'tel',
            )
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </section>
        <div className="preview-card">
          <div className="preview-card-header">
            <span>
              <span className="live-dot" /> ПРЕДПРОСМОТР
            </span>
            <span className="quality-badge">HQ</span>
          </div>
          {data ? (
            <QrPreview data={data} style={style} onError={setQrError} />
          ) : (
            <div className="qr-preview qr-preview-empty">
              <QrCode size={48} />
              <span>Введите содержимое QR</span>
            </div>
          )}
          {style.transparent && (
            <p className="transparency-hint">
              Прозрачный фон · для {transparentMatte(style) === '#000000' ? 'тёмной' : 'светлой'} подложки
            </p>
          )}
        </div>
        <section className="card style-card">
          <div className="section-label">
            <span className="step">02</span>
            <h2>Оформление</h2>
            <Palette size={18} className="trailing-icon" />
          </div>
          <span className="field-caption">Форма модулей</span>
          <div className="shape-options">
            {(
              [
                {id: 'square', label: 'Квадраты'},
                {id: 'rounded', label: 'Мягкие'},
                {id: 'dots', label: 'Точки'},
              ] as const
            ).map(({id, label}) => (
              <button
                key={id}
                className={`shape-option ${style.dots === id ? 'selected' : ''}`}
                aria-pressed={style.dots === id}
                onClick={() => updateStyle({dots: id})}
              >
                <span className={`shape-sample sample-${id}`}>
                  {Array.from({length: 9}, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
                {label}
                {style.dots === id && <Check size={14} />}
              </button>
            ))}
          </div>
          <PaintEditor
            title="Цвет кода"
            value={{color: style.color, gradient: style.foregroundGradient}}
            onChange={(paint) => updateStyle({color: paint.color, foregroundGradient: paint.gradient})}
          />
          <PaintEditor
            title="Фон"
            value={{color: style.background, gradient: style.backgroundGradient}}
            onChange={(paint) => updateStyle({background: paint.color, backgroundGradient: paint.gradient})}
            transparent={style.transparent}
            onTransparentChange={(transparent) => updateStyle({transparent})}
          />
          {lowContrast && <p className="field-error">Низкий контраст — такой QR сложнее прочитать.</p>}
          <div className="center-editor">
            <span className="field-caption">В центре</span>
            <div className="segmented center-modes" role="group" aria-label="Содержимое в центре QR">
              {(
                [
                  {id: 'none', label: 'Нет'},
                  {id: 'image', label: 'Картинка'},
                  {id: 'text', label: 'Текст'},
                ] as const
              ).map(({id, label}) => (
                <button
                  key={id}
                  className={centerMode === id ? 'active' : ''}
                  aria-pressed={centerMode === id}
                  onClick={() => {
                    setCenterMode(id);
                    if (id === 'none') updateStyle({logo: undefined, centerText: undefined});
                    else if (id === 'image') updateStyle({centerText: undefined});
                    else
                      updateStyle({
                        logo: undefined,
                        centerText: style.centerText || {text: 'QR', color: style.color},
                      });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {centerMode === 'image' && (
              <div className="logo-row">
                {style.logo ? (
                  <div className="logo-actions">
                    <img src={style.logo} alt="Ваш логотип" />
                    <Button view="outlined" size="l" onClick={() => logoInput.current?.click()}>
                      Заменить
                    </Button>
                    <Button
                      view="flat"
                      size="l"
                      aria-label="Убрать логотип"
                      onClick={() => updateStyle({logo: undefined})}
                    >
                      <X size={18} />
                    </Button>
                  </div>
                ) : (
                  <Button view="outlined" size="l" onClick={() => logoInput.current?.click()}>
                    <ImagePlus size={17} /> Добавить картинку
                  </Button>
                )}
              </div>
            )}
            {centerMode === 'text' && (
              <div className="center-text-fields">
                <label className="field">
                  <span>
                    Текст в центре <small>{Array.from(style.centerText?.text || '').length}/24</small>
                  </span>
                  <TextInput
                    size="l"
                    value={style.centerText?.text || ''}
                    onUpdate={(text) =>
                      updateStyle({
                        centerText: {
                          text: Array.from(text).slice(0, 24).join(''),
                          color: style.centerText?.color || style.color,
                        },
                      })
                    }
                    placeholder="Например, QRessi"
                    controlProps={{'aria-label': 'Текст в центре QR', maxLength: 48}}
                  />
                </label>
                <button
                  className="paint-color"
                  onClick={() => setTextColorPicker(true)}
                  aria-label="Настроить цвет текста"
                >
                  <i style={{background: style.centerText?.color || style.color}} />
                  <span>Цвет текста</span>
                  <Palette size={16} />
                </button>
              </div>
            )}
            <input
              ref={logoInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                void addLogo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </section>
        <div className="export-card">
          <div className="format-row">
            <span>Экспорт</span>
            <Button
              view="flat"
              size="m"
              aria-label="Чем отличаются PNG и SVG"
              title="О форматах"
              onClick={() => setFormatInfo(true)}
            >
              <Info size={18} />
            </Button>
          </div>
          <Button
            view="action"
            size="xl"
            width="max"
            disabled={disabled}
            loading={exporting === 'png'}
            onClick={() => {
              void act('png');
            }}
          >
            <ArrowDownToLine size={19} /> {Capacitor.isNativePlatform() ? 'Сохранить PNG' : 'Скачать PNG'}
          </Button>
          <Button
            view="outlined"
            size="xl"
            width="max"
            disabled={disabled}
            loading={exporting === 'svg'}
            onClick={() => {
              void act('svg');
            }}
          >
            <ArrowDownToLine size={19} /> {Capacitor.isNativePlatform() ? 'Сохранить SVG' : 'Скачать SVG'}
          </Button>
          {Capacitor.isNativePlatform() && (
            <Button
              view="outlined"
              size="xl"
              width="max"
              disabled={disabled}
              loading={exporting === 'share'}
              onClick={() => {
                void act('share');
              }}
            >
              <Share2 size={18} /> Поделиться PNG
            </Button>
          )}
          <label className="field name-field">
            <span>
              Название <small>необязательно</small>
            </span>
            <TextInput
              size="l"
              value={name}
              onUpdate={setName}
              placeholder="Чтобы легко найти в истории"
              controlProps={{'aria-label': 'Название QR-кода', maxLength: 120}}
            />
          </label>
          <Button
            view="outlined"
            size="xl"
            width="max"
            disabled={disabled}
            onClick={() => {
              void act('save');
            }}
          >
            <Save size={18} /> Сохранить в историю
          </Button>
          <button
            className="check-button"
            disabled={disabled}
            onClick={() => {
              void act('check');
            }}
          >
            {checked ? <CheckCheck size={16} /> : <ShieldCheck size={16} />}
            {checked ? 'Код успешно читается' : 'Проверить читаемость'}
          </button>
        </div>
      </div>
      {textColorPicker && (
        <ColorPicker
          title="Цвет текста"
          value={style.centerText?.color || style.color}
          onClose={() => setTextColorPicker(false)}
          onApply={(color) => updateStyle({centerText: {text: style.centerText?.text || '', color}})}
        />
      )}
      {formatInfo && <FormatInfo data={data} style={style} onClose={() => setFormatInfo(false)} />}
      {appPicker && (
        <AppPicker
          onClose={() => setAppPicker(false)}
          onSelect={(app) => {
            update('appPackage', app.packageName);
            setName(app.name);
            setAppPicker(false);
          }}
        />
      )}
    </section>
  );
}
