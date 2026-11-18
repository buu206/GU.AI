import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ProjectRecord, RuntimeStatus } from '../../shared/contracts';
import { PROJECT_STATUS_LABELS } from '../ui';
import { DesktopWallpaper } from './DesktopPet';
import { DesktopWindow, type DesktopBounds, type WindowGeometry } from './DesktopWindow';

type WindowId = 'terminal' | 'preview';
const titles: Record<WindowId, string> = { terminal: 'BUILD.EXE / 制作终端', preview: 'GAME.EXE / 游戏工作区' };
function arrangement({ width, height }: DesktopBounds): Record<WindowId, WindowGeometry> {
  const narrow = width < 1050;
  const left = width < 600 ? 10 : 128;
  const available = width - left - 22;
  const terminalWidth = narrow ? Math.min(540, available) : Math.max(380, Math.round(available * .36));
  const base = { open: true, minimized: false, maximized: false, y: 20, height: Math.max(300, height - 42) };
  return {
    terminal: { ...base, x: left, width: terminalWidth, z: 3 },
    preview: { ...base, x: narrow ? left + 25 : left + terminalWidth + 18, y: narrow ? 44 : 20,
      width: narrow ? available - 25 : available - terminalWidth - 18, height: Math.max(300, height - (narrow ? 66 : 42)), z: 2 },
  };
}
interface Props {
  project: ProjectRecord; runtime: RuntimeStatus; terminal: ReactNode; preview: ReactNode;
  onHome: () => void; onCreate: () => void; onSettings: () => void;
  onRename: () => void; onPin: () => void; onDelete: () => void;
}
export function ProductionDesktop({ project, runtime, terminal, preview, onHome, onCreate, onSettings, onRename, onPin, onDelete }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 1440, height: 800 });
  const [windows, setWindows] = useState(() => arrangement(bounds));
  const [active, setActive] = useState<WindowId>('terminal');
  const nextZ = useRef(4);
  const touched = useRef(false);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const size = { width: entry.contentRect.width, height: entry.contentRect.height };
      setBounds(size);
      if (!touched.current) setWindows(arrangement(size));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function activate(id: WindowId) {
    setActive(id);
    setWindows(previous => previous[id].z === nextZ.current - 1 ? previous : {
      ...previous, [id]: { ...previous[id], z: nextZ.current++ },
    });
  }
  function restore(id: WindowId) {
    setWindows(previous => ({ ...previous, [id]: { ...previous[id], open: true, minimized: false, z: nextZ.current++ } }));
    setActive(id);
  }
  return <div id="game-desktop" className="production-desktop">
    <header className="desktop-menubar">
      <button className="production-home" onClick={onHome} title="返回创作桌面">▦ GAME//OS</button>
      <details className="production-project-menu">
        <summary>{project.name} ▾</summary>
        <div onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}>
          <button onClick={onRename}>重命名</button>
          <button onClick={onPin}>{project.pinned ? '取消置顶' : '置顶游戏'}</button>
          <button onClick={onDelete}>删除游戏…</button>
        </div>
      </details>
      <span className="production-status"><i className={`runtime-dot state-${runtime.state}`} />{PROJECT_STATUS_LABELS[project.status]}</span>
    </header>
    <div className="desktop-canvas" ref={canvas}>
      <DesktopWallpaper />
      <nav className="desktop-icons" aria-label="制作桌面">
        <button onClick={onHome}><span className="desktop-folder blue" aria-hidden="true"><i>▦</i></span>我的游戏</button>
        <button onClick={() => restore('terminal')}><span className="desktop-folder pink" aria-hidden="true"><i>›_</i></span>制作终端</button>
        <button onClick={() => restore('preview')}><span className="desktop-folder" aria-hidden="true"><i>▷</i></span>游戏工作区</button>
        <button onClick={onCreate}><span className="desktop-folder gold" aria-hidden="true"><i>+</i></span>新建游戏</button>
      </nav>
      {(['terminal', 'preview'] as const).map(id => <div key={id} hidden={!windows[id].open || windows[id].minimized}><DesktopWindow id={id} title={titles[id]}
        geometry={{ ...windows[id], open: true, minimized: false }} bounds={bounds} active={active === id}
        onActivate={() => activate(id)} onChange={change => {
          touched.current = true;
          setWindows(previous => ({ ...previous, [id]: { ...previous[id], ...change } }));
        }}>
        {id === 'terminal' ? terminal : preview}
      </DesktopWindow></div>)}
    </div>
    <footer className="desktop-taskbar">
      <button className="desktop-start" onClick={onHome}>▦ 桌面</button>
      <div className="desktop-tasks">{(['terminal', 'preview'] as const).map(id =>
        <button key={id} className={active === id && windows[id].open && !windows[id].minimized ? 'active' : ''}
          onClick={() => restore(id)}>{id === 'terminal' ? '›_ 制作终端' : '▷ 游戏工作区'}</button>)}</div>
      <button className="desktop-runtime" onClick={() => { touched.current = false; setWindows(arrangement(bounds)); setActive('terminal'); nextZ.current = 4; }}>排列窗口</button>
      <button className="desktop-runtime" onClick={onSettings}>设置</button>
    </footer>
  </div>;
}
