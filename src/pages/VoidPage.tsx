import { useCallback, useEffect, useRef, useState } from 'react';

function apiOrigin(): string {
  const base = import.meta.env.VITE_API_URL;
  if (typeof base === 'string' && base.startsWith('http')) {
    return base.replace(/\/?api\/?$/, '');
  }
  return '';
}

function streamUrl(): string {
  const o = apiOrigin();
  return o ? `${o}/api/void/stream` : '/api/void/stream';
}

function postUrl(path: string): string {
  const o = apiOrigin();
  return o ? `${o}/api/void${path}` : `/api/void${path}`;
}

export function VoidPage() {
  const sessionIdRef = useRef(crypto.randomUUID());
  const [text, setText] = useState('');
  const textRef = useRef('');
  const leftOnceRef = useRef(false);

  const leave = useCallback(() => {
    if (leftOnceRef.current) return;
    leftOnceRef.current = true;
    const sid = sessionIdRef.current;
    const body = JSON.stringify({ sessionId: sid });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(postUrl('/leave'), new Blob([body], { type: 'application/json' }));
      } else {
        void fetch(postUrl('/leave'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    const es = new EventSource(streamUrl());
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { segments?: { sessionId: string; text: string }[] };
        const segs = data.segments ?? [];
        const next = segs.map((s) => s.text).join('');
        setText(next);
        textRef.current = next;
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => {
      es.close();
      leave();
    };
  }, [leave]);

  useEffect(() => {
    const onHide = () => leave();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [leave]);

  const flushAppend = useRef('');
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendAppend = useCallback((add: string, del: number) => {
    if (!add && !del) return;
    void fetch(postUrl('/append'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionIdRef.current, add: add || undefined, del: del || undefined }),
    }).catch(() => {});
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      const a = flushAppend.current;
      flushAppend.current = '';
      if (a) sendAppend(a, 0);
    }, 45);
  }, [sendAppend]);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    const prev = textRef.current;
    if (next.length > prev.length && next.startsWith(prev)) {
      const add = next.slice(prev.length);
      flushAppend.current += add;
      textRef.current = next;
      setText(next);
      scheduleFlush();
      return;
    }
    if (next.length < prev.length && prev.startsWith(next)) {
      const del = prev.length - next.length;
      sendAppend('', del);
      textRef.current = next;
      setText(next);
      return;
    }
    setText(prev);
  };

  return (
    <textarea
      className="void-surface"
      value={text}
      onChange={onChange}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      aria-hidden
    />
  );
}
