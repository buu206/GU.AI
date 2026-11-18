import {
  useEffect,
  useId,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from 'react';

interface ModalProps extends PropsWithChildren {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
  footer?: ReactNode;
  closeLabel?: string;
  onClose?: () => void;
}

export function Modal({
  eyebrow,
  title,
  description,
  className = '',
  footer,
  closeLabel = '关闭',
  onClose,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => {
      // Focus the window itself: Enter must never approve a command on opening.
      dialog?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('.modal[aria-modal="true"]');
      if (dialogs.item(dialogs.length - 1) !== dialog) return;
      if (event.key === 'Escape' && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = focusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (onClose && event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="pixel-modal-titlebar"><span><i aria-hidden="true" />{eyebrow}</span>{onClose ? <button type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose}>×</button> : <span className="pixel-modal-lock">待确认</span>}</div>
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>

        </header>
        <div className="modal-content">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
}
