import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

export interface WindowGeometry {
  x: number; y: number; width: number; height: number;
  open: boolean; minimized: boolean; maximized: boolean; z: number;
}
export interface DesktopBounds { width: number; height: number }
interface Props {
  id: string; title: string; geometry: WindowGeometry; bounds: DesktopBounds;
  active: boolean; blocked?: boolean; children: ReactNode;
  onActivate: () => void; onChange: (change: Partial<WindowGeometry>) => void;
}
interface Drag {
  pointerId: number; edge: string; startX: number; startY: number;
  rect: { x: number; y: number; width: number; height: number }; oldCursor: string;
}
const EDGES = ['n', 'e', 's', 'w', 'nw', 'ne', 'sw', 'se'] as const;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(n, high));

export function fittedWindow(geometry: WindowGeometry, bounds: DesktopBounds) {
  if (bounds.width < 600) return {
    x: 10, y: 132, width: Math.max(240, bounds.width - 20), height: Math.max(240, bounds.height - 144),
  };
  if (geometry.maximized) return {
    x: 10, y: 10, width: bounds.width - 20, height: bounds.height - 20,
  };
  const width = clamp(geometry.width, Math.min(360, bounds.width - 20), bounds.width - 20);
  const height = clamp(geometry.height, Math.min(300, bounds.height - 20), bounds.height - 20);
  return {
    width, height, x: clamp(geometry.x, 10, bounds.width - width - 10),
    y: clamp(geometry.y, 10, bounds.height - height - 10),
  };
}

export function DesktopWindow({ id, title, geometry, bounds, active, blocked, children, onActivate, onChange }: Props) {
  const drag = useRef<Drag | null>(null);
  const [dragCursor, setDragCursor] = useState('');
  const compact = bounds.width < 600;
  const rect = fittedWindow(geometry, bounds);
  useEffect(() => () => {
    if (drag.current) document.body.style.cursor = drag.current.oldCursor;
  }, []);
  function finish(event?: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || (event && event.pointerId !== current.pointerId)) return;
    drag.current = null;
    document.body.style.cursor = current.oldCursor;
    setDragCursor('');
    if (event?.currentTarget.hasPointerCapture(current.pointerId)) event.currentTarget.releasePointerCapture(current.pointerId);
  }
  function start(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || !event.isPrimary || drag.current) return;
    onActivate();
    if (compact || geometry.maximized) return;
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>('[data-resize]');
    if (!handle && (!target.closest('[data-window-drag]') || target.closest('button'))) return;
    event.preventDefault();
    const edge = handle?.dataset.resize ?? 'move';
    const cursor = edge === 'move' ? 'grabbing' : getComputedStyle(handle!).cursor;
    drag.current = {
      pointerId: event.pointerId, edge, startX: event.clientX, startY: event.clientY,
      rect, oldCursor: document.body.style.cursor,
    };
    document.body.style.cursor = cursor;
    setDragCursor(cursor);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY, r = current.rect;
    if (current.edge === 'move') {
      onChange({ x: clamp(r.x + dx, 10, bounds.width - r.width - 10), y: clamp(r.y + dy, 10, bounds.height - r.height - 10) });
      return;
    }
    let left = r.x, top = r.y, right = r.x + r.width, bottom = r.y + r.height;
    const minW = Math.min(360, bounds.width - 20), minH = Math.min(300, bounds.height - 20);
    if (current.edge.includes('e')) right = clamp(right + dx, left + minW, bounds.width - 10);
    if (current.edge.includes('s')) bottom = clamp(bottom + dy, top + minH, bounds.height - 10);
    if (current.edge.includes('w')) left = clamp(left + dx, 10, right - minW);
    if (current.edge.includes('n')) top = clamp(top + dy, 10, bottom - minH);
    onChange({ x: left, y: top, width: right - left, height: bottom - top });
  }
  if (!geometry.open || geometry.minimized) return null;
  return (
    <section
      className={'desktop-window ' + (active ? 'is-front ' : '') + (dragCursor ? 'is-dragging' : '')}
      data-desktop-window={id} role="dialog" aria-label={title}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: geometry.z, '--window-cursor': dragCursor } as CSSProperties}
      onFocusCapture={onActivate}
      onPointerDown={start} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={finish} onLostPointerCapture={finish}
    >
      <header className="desktop-titlebar" data-window-drag onDoubleClick={(event) => {
        if (!compact && !(event.target as HTMLElement).closest('button')) onChange({ maximized: !geometry.maximized });
      }}>
        <span className="desktop-window-title"><i aria-hidden="true" />{title}</span>
        <span className="desktop-window-controls">
          <button type="button" aria-label={'最小化' + title} onClick={() => onChange({ minimized: true })}>−</button>
          {!compact && <button type="button" aria-label={(geometry.maximized ? '还原' : '最大化') + title} onClick={() => onChange({ maximized: !geometry.maximized })}>{geometry.maximized ? '▣' : '□'}</button>}
          <button type="button" className="desktop-close" disabled={blocked} aria-label={'关闭' + title} onClick={() => onChange({ open: false })}>×</button>
        </span>
      </header>
      <div className="desktop-window-body">{children}</div>
      {!compact && !geometry.maximized && EDGES.map((edge) => edge === 'se' ? (
        <button key={edge} type="button" className="desktop-resize" data-resize={edge}
          aria-label="调整窗口大小，方向键调整宽高"
          onKeyDown={(event) => {
            if (!event.key.startsWith('Arrow')) return;
            event.preventDefault();
            const step = event.shiftKey ? 32 : 16;
            onChange({
              width: clamp(rect.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), 360, bounds.width - rect.x - 10),
              height: clamp(rect.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0), 300, bounds.height - rect.y - 10),
            });
          }}
        />
      ) : <span key={edge} className="desktop-resize" data-resize={edge} aria-hidden="true" />)}
    </section>
  );
}
