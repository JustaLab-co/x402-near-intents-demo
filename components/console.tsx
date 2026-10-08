'use client';

import { useEffect, useRef } from 'react';
import type { Line } from '@/lib/use-swap-flow';

const PREFIX: Record<Line['kind'], string> = { out: '>', in: '<', challenge: '$', note: '#', error: '!' };

export function Console({ lines, active }: { lines: Line[]; active: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [lines.length]);

  return (
    <section className="console" aria-label="Protocol log">
      <Rain active={active} />
      <div ref={scroller} className="console-body" role="log" aria-live="polite">
        {lines.length === 0 && (
          <p className="line note">
            <span className="prompt">#</span> Requests, signatures and settlements show up here as they happen.
          </p>
        )}
        {lines.map((l, i) => (
          <div key={l.id} className={`line ${l.kind}`}>
            <span className="time">{l.at.toLocaleTimeString([], { hour12: false })}</span>
            <span className="prompt">{PREFIX[l.kind]}</span>
            <span className="text">
              {l.text}
              {l.href && (
                <>
                  {' '}
                  <a href={l.href} target="_blank" rel="noreferrer">
                    open in explorer
                  </a>
                </>
              )}
              {i === lines.length - 1 && active && <span className="cursor" aria-hidden />}
            </span>
            {l.detail !== undefined && (
              <details>
                <summary>payload</summary>
                <pre>{JSON.stringify(l.detail, jsonBigint, 2)}</pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const jsonBigint = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

const GLYPHS = '0123456789abcdefx402アイウエオカキクケコサシスセソ$';

/** Falling glyphs behind the log, drawn only while a flow is running. */
function Rain({ active }: { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !active || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const size = 14;
    el.width = el.clientWidth;
    el.height = el.clientHeight;
    const drops = Array.from({ length: Math.ceil(el.width / size) }, () => Math.random() * -50);
    ctx.font = `${size}px var(--font-mono), monospace`;

    const timer = setInterval(() => {
      ctx.fillStyle = 'rgba(2, 8, 5, 0.12)';
      ctx.fillRect(0, 0, el.width, el.height);
      ctx.fillStyle = '#1f9d55';
      drops.forEach((y, col) => {
        ctx.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], col * size, y * size);
        drops[col] = y * size > el.height && Math.random() > 0.97 ? 0 : y + 1;
      });
    }, 60);

    return () => {
      clearInterval(timer);
      ctx.clearRect(0, 0, el.width, el.height);
    };
  }, [active]);

  return <canvas ref={canvas} className="rain" aria-hidden />;
}
