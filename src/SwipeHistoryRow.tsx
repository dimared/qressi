import {Trash2} from 'lucide-react';
import {useEffect, useRef, useState, type PointerEvent, type ReactNode} from 'react';
import type {Notify} from './types';

type Gesture = {id: number; x: number; y: number; distance: number; locked: boolean; vertical: boolean};

export default function SwipeHistoryRow({
  title,
  onOpen,
  onDelete,
  notify,
  children,
}: {
  title: string;
  onOpen: () => void;
  onDelete: () => Promise<void>;
  notify: Notify;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const gesture = useRef<Gesture | undefined>(undefined);
  const suppressUntil = useRef(0);
  const removing = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const animations = useRef<Animation[]>([]);
  useEffect(() => () => animations.current.forEach((animation) => animation.cancel()), []);

  async function remove() {
    if (removing.current) return;
    removing.current = true;
    setDeleting(true);
    try {
      const row = rowRef.current,
        button = buttonRef.current;
      if (row && button && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const slide = button.animate(
          [
            {transform: getComputedStyle(button).transform, opacity: 1},
            {transform: 'translateX(-100%)', opacity: 0},
          ],
          {duration: 210, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards'},
        );
        animations.current.push(slide);
        await slide.finished.catch(() => {});
        const collapse = row.animate(
          [
            {height: `${row.getBoundingClientRect().height}px`, marginBottom: '0px', opacity: 1},
            {height: '0px', marginBottom: '-10px', opacity: 0},
          ],
          {duration: 170, easing: 'ease-in-out', fill: 'forwards'},
        );
        animations.current.push(collapse);
        await collapse.finished.catch(() => {});
      }
      await onDelete();
    } catch {
      setOffset(0);
      notify('Не удалось удалить код. История не изменена.');
    } finally {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
      removing.current = false;
      setDeleting(false);
    }
  }

  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = undefined;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.locked) suppressUntil.current = performance.now() + 500;
    const threshold = Math.max(72, Math.min(110, event.currentTarget.clientWidth * 0.25));
    if (!cancelled && current.locked && current.distance >= threshold) {
      void remove();
    } else setOffset(0);
  }

  return (
    <div ref={rowRef} className={`swipe-history-row ${offset ? 'is-swiping' : ''}`}>
      <div className="swipe-delete-hint" aria-hidden="true">
        <Trash2 size={20} />
        <span>Удалить</span>
      </div>
      <button
        ref={buttonRef}
        className={`history-item ${dragging ? 'is-dragging' : ''}`}
        style={{transform: `translateX(${-offset}px)`}}
        disabled={deleting}
        aria-keyshortcuts="Delete"
        aria-label={title}
        onClick={(event) => {
          if (performance.now() < suppressUntil.current) {
            event.preventDefault();
            return;
          }
          onOpen();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Delete') {
            event.preventDefault();
            void remove();
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || removing.current) return;
          gesture.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            distance: 0,
            locked: false,
            vertical: false,
          };
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.id !== event.pointerId || current.vertical) return;
          const dx = event.clientX - current.x,
            dy = event.clientY - current.y;
          if (!current.locked) {
            if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
              current.vertical = true;
              return;
            }
            if (dx >= -10 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
            current.locked = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }
          current.distance = Math.max(0, -dx);
          setOffset(Math.min(140, current.distance));
        }}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
      >
        {children}
      </button>
    </div>
  );
}
