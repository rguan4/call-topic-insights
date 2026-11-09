import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FOCUSABLE, trapTab } from '../lib/focus';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Accessible dialog: traps focus, closes on Escape or backdrop, restores focus on close. */
export function Modal({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const items = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (items && items.length > 1 ? items[1] : items?.[0])?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    trapTab(e, ref.current);
  };

  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} />
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        {children}
      </div>
    </>,
    document.body
  );
}
