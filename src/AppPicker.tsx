import {TextInput} from '@gravity-ui/uikit';
import {Search, Smartphone} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {listInstalledApps, loadAppIcon, type InstalledApp} from './device';
import Dialog from './Dialog';

function AppIcon({packageName}: {packageName: string}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void loadAppIcon(packageName).then((icon) => {
        if (!cancelled) setSrc(icon);
      });
    };
    if (!ref.current || typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      {rootMargin: '80px'},
    );
    observer.observe(ref.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [packageName]);
  return (
    <span className="installed-app-icon" ref={ref} aria-hidden="true">
      {src ? (
        <img src={src} width="40" height="40" alt="" decoding="async" onError={() => setSrc(undefined)} />
      ) : (
        <Smartphone size={22} />
      )}
    </span>
  );
}

export default function AppPicker({
  onSelect,
  onClose,
}: {
  onSelect: (app: InstalledApp) => void;
  onClose: () => void;
}) {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listInstalledApps()
      .then((items) => {
        if (!cancelled) setApps(items);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось получить список. Можно указать ссылку Google Play вручную.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const filtered = apps.filter((app) =>
    `${app.name} ${app.packageName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <Dialog title="Установленные приложения" onClose={onClose}>
      <TextInput
        size="xl"
        value={query}
        onUpdate={setQuery}
        placeholder="Название или имя пакета"
        startContent={<Search size={18} />}
        controlProps={{'aria-label': 'Поиск приложения'}}
      />
      <div className="installed-apps">
        {loading ? (
          <p className="hint">Загружаем список…</p>
        ) : error ? (
          <p className="field-error">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="hint">Приложения не найдены.</p>
        ) : (
          filtered.map((app) => (
            <button key={app.packageName} onClick={() => onSelect(app)}>
              <AppIcon packageName={app.packageName} />
              <span>
                <strong>{app.name}</strong>
                <small>{app.packageName}</small>
              </span>
            </button>
          ))
        )}
      </div>
      <p className="hint">
        QR будет содержать ссылку на Google Play, а не файл приложения. Для приложений вне Google Play
        страница может отсутствовать.
      </p>
    </Dialog>
  );
}
