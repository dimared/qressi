import {Button, TextInput} from '@gravity-ui/uikit';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  FileText,
  Heart,
  Link,
  Search,
  Upload,
  Wifi,
} from 'lucide-react';
import {useMemo, useRef, useState} from 'react';
import {validateBackup} from './data';
import {saveFile} from './storage';
import SwipeHistoryRow from './SwipeHistoryRow';
import {LABELS, type Entry, type Notify} from './types';

export default function History({
  entries,
  loaded,
  onSelect,
  onImport,
  onDelete,
  notify,
}: {
  entries: Entry[];
  loaded: boolean;
  onSelect: (entry: Entry) => void;
  onImport: (entries: Entry[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  notify: Notify;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        const matches = `${entry.title} ${entry.data}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase());
        return (
          matches &&
          (filter === 'all' || (filter === 'favorites' && entry.favorite) || entry.source === filter)
        );
      }),
    [entries, filter, query],
  );

  async function backup() {
    setBusy(true);
    try {
      await saveFile(
        new Blob([JSON.stringify({app: 'qressi', version: 1, entries}, null, 2)], {
          type: 'application/json',
        }),
        `qressi-backup-${new Date().toISOString().slice(0, 10)}.json`,
      );
    } catch {
      notify('Не удалось экспортировать историю.');
    } finally {
      setBusy(false);
    }
  }

  async function restore(file?: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      notify('Размер резервной копии не должен превышать 10 МБ.');
      return;
    }
    setBusy(true);
    try {
      const imported = validateBackup(JSON.parse(await file.text()));
      await onImport(imported);
      notify(`Импортировано записей: ${imported.length}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Не удалось прочитать копию.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page history-page" aria-label="История QR-кодов">
      <div className="page-heading">
        <h1>История</h1>
      </div>
      <div className="history-toolbar">
        <TextInput
          size="xl"
          value={query}
          onUpdate={setQuery}
          placeholder="Найти код, ссылку или контакт"
          startContent={<Search size={19} />}
          controlProps={{'aria-label': 'Поиск по истории'}}
        />
        <div className="backup-actions">
          <Button
            view="outlined"
            size="l"
            disabled={!entries.length || !loaded || busy}
            onClick={() => {
              void backup();
            }}
          >
            <ArrowDownToLine size={17} /> Копия
          </Button>
          <Button
            view="outlined"
            size="l"
            disabled={!loaded || busy}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={17} /> Импорт
          </Button>
        </div>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            void restore(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <div className="history-filters" role="group" aria-label="Фильтр истории">
        {[
          {id: 'all', label: 'Все'},
          {id: 'favorites', label: 'Избранное'},
          {id: 'created', label: 'Созданные'},
          {id: 'scanned', label: 'Сканирования'},
        ].map(({id, label}) => (
          <button
            key={id}
            className={filter === id ? 'active' : ''}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
            {id === 'all' && <span>{entries.length}</span>}
          </button>
        ))}
      </div>
      {!loaded ? (
        <div className="empty-state">
          <Clock3 size={36} />
          <h2>Открываем историю…</h2>
        </div>
      ) : !filtered.length ? (
        <div className="empty-state">
          <div className="empty-illustration">
            <Clock3 size={36} />
          </div>
          <h2>{entries.length ? 'Пока ничего не найдено' : 'История пуста'}</h2>
          <p>{entries.length ? 'Попробуй другой запрос или фильтр.' : 'Создайте QR или отсканируйте код.'}</p>
        </div>
      ) : (
        <div className="history-list">
          <p className="swipe-instruction">
            <ArrowLeft size={16} /> Смахните строку влево, чтобы удалить
          </p>
          {filtered.map((entry) => {
            const KindIcon = entry.kind === 'url' ? Link : entry.kind === 'wifi' ? Wifi : FileText;
            return (
              <SwipeHistoryRow
                key={entry.id}
                title={entry.title}
                onOpen={() => onSelect(entry)}
                onDelete={() => onDelete(entry.id)}
                notify={notify}
              >
                <span className={`history-kind kind-${entry.kind}`}>
                  <KindIcon size={23} />
                </span>
                <span className="history-item-content">
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.kind === 'wifi'
                      ? 'Настройки подключения к сети'
                      : entry.data.replace(/\r?\n/g, ' ').slice(0, 100)}
                  </span>
                  <small>
                    {entry.codeFormat && entry.codeFormat !== 'QR_CODE'
                      ? entry.codeFormat.replaceAll('_', ' ')
                      : LABELS[entry.kind]}{' '}
                    <i>·</i>{' '}
                    {new Date(entry.date).toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'})}{' '}
                    <i>·</i> {entry.source === 'created' ? 'Создан' : 'Сканирован'}
                  </small>
                </span>
                {entry.favorite && <Heart size={17} className="favorite-heart" fill="currentColor" />}
                <ArrowUpRight size={18} className="history-arrow" />
              </SwipeHistoryRow>
            );
          })}
        </div>
      )}
      <p className="history-footnote">История хранится на этом устройстве · до 1000 кодов</p>
    </section>
  );
}
