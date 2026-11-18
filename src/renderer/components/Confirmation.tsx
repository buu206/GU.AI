import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Modal } from './Modal';

type Request = { message: string; resolve: (accepted: boolean) => void };
const ConfirmationContext = createContext<((message: string) => Promise<boolean>) | null>(null);

export function ConfirmationProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<Request | null>(null);
  const pending = useRef<Request | null>(null);
  const confirm = useCallback((message: string) => new Promise<boolean>(resolve => {
    // A second click never replaces an unanswered decision.
    if (pending.current) { resolve(false); return; }
    pending.current = { message, resolve };
    setRequest(pending.current);
  }), []);
  useEffect(() => () => { pending.current?.resolve(false); pending.current = null; }, []);
  function settle(accepted: boolean) {
    const current = pending.current;
    pending.current = null;
    setRequest(null);
    current?.resolve(accepted);
  }
  return <ConfirmationContext.Provider value={confirm}>
    {children}
    {request && <Modal eyebrow="CONFIRM.EXE" title="确认操作" className="confirmation-modal"
      onClose={() => settle(false)} footer={<>
        <button className="secondary-button" onClick={() => settle(false)}>取消</button>
        <button className="primary-button" onClick={() => settle(true)}>确认继续</button>
      </>}><p className="confirmation-message">{request.message}</p></Modal>}
  </ConfirmationContext.Provider>;
}
export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error('ConfirmationProvider is required');
  return confirm;
}
