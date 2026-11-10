import {Button} from '@gravity-ui/uikit';
import {X} from 'lucide-react';
import {useEffect, useId, useRef, type ReactNode} from 'react';

export default function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select, a[href], [tabindex="0"]',
        ) || [],
      ).filter((node) => node.offsetParent !== null);
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const back = (event: Event) => {
      event.preventDefault();
      close.current();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('qressi-back', back);
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
      window.removeEventListener('keydown', key);
      window.removeEventListener('qressi-back', back);
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={ref}
        className={`dialog ${wide ? 'dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="dialog-header">
          <h2 id={id}>{title}</h2>
          <Button view="flat" size="l" aria-label="Закрыть" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}
