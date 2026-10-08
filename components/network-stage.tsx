'use client';

import { useEffect, useRef } from 'react';
import type { Address } from 'viem';
import { BASE, type Network } from '@/lib/chains';
import type { Phase } from '@/lib/use-swap-flow';

const USDC_BLUE = '#2775CA';
const NEAR_GREEN = '#00EC97';

const GATE = { x: 500, y: 62 };
const ORIGIN = { x: 150, y: 255 };
const HUB = { x: 500, y: 255 };
const TARGET = { x: 850, y: 255 };

// Routes run center to center; the nodes are drawn on top, so a coin lands
// inside the node it flies to and fades out there.
const PATHS = {
  pay: `M${ORIGIN.x} ${ORIGIN.y} C 170 120, 330 ${GATE.y}, ${GATE.x} ${GATE.y}`,
  deposit: `M${ORIGIN.x} ${ORIGIN.y} C 260 150, 390 150, ${HUB.x} ${HUB.y}`,
  deliver: `M${HUB.x} ${HUB.y} C 610 150, 740 150, ${TARGET.x} ${TARGET.y}`,
  refund: `M${HUB.x} ${HUB.y} C 390 400, 260 400, ${ORIGIN.x} ${ORIGIN.y}`,
};

type NodeState = 'idle' | 'busy' | 'done';

interface Props {
  phase: Phase;
  dest: Network;
  amount: string;
  expectedOut?: string;
  hubStatus?: string;
  account?: Address;
  payTo?: Address;
  depositAddress?: Address;
  originBalance?: string;
  targetBalance?: string;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function NetworkStage(props: Props) {
  const { phase, dest, amount, expectedOut, hubStatus, account, payTo, depositAddress } = props;
  const paid = ['quoted', 'depositing', 'bridging', 'delivered', 'refunded'].includes(phase);
  const origin: NodeState = ['activating', 'paying', 'depositing'].includes(phase) ? 'busy' : 'idle';
  const hub: NodeState = phase === 'bridging' ? 'busy' : phase === 'delivered' ? 'done' : 'idle';
  const target: NodeState = phase === 'delivered' ? 'done' : 'idle';

  return (
    <svg viewBox="0 0 1000 400" className="stage" role="img" aria-label={`USDC moving from Base to ${dest.name} through NEAR Intents`}>
      <defs>
        <radialGradient id="glow">
          <stop offset="0%" stopColor="white" stopOpacity="0.35" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d={PATHS.pay} className={`route ${phase === 'paying' ? 'live' : ''}`} />
      <path d={PATHS.deposit} className={`route ${phase === 'depositing' || phase === 'bridging' ? 'live' : ''}`} />
      <path d={PATHS.deliver} className={`route ${phase === 'bridging' ? 'live' : ''}`} />
      {phase === 'refunded' && <path d={PATHS.refund} className="route live" />}

      <text x={250} y={130} className="route-label">0.005 USDC</text>
      <text x={325} y={180} className="route-label" textAnchor="middle">{amount} USDC</text>
      <text x={675} y={180} className="route-label" textAnchor="middle">
        {expectedOut ? `≈ ${expectedOut} USDC` : 'USDC'}
      </text>

      <g className={`gate ${phase === 'paying' ? 'busy' : ''} ${paid ? 'done' : ''}`}>
        <rect x={GATE.x - 112} y={GATE.y - 34} width={224} height={68} rx={14} />
        <text x={GATE.x} y={GATE.y - 4} textAnchor="middle" className="node-name">x402 paywall</text>
        <text x={GATE.x} y={GATE.y + 18} textAnchor="middle" className="node-caption">
          {paid && payTo ? `Paid to ${short(payTo)}` : 'Swap quote costs 0.005 USDC'}
        </text>
      </g>

      <ChainNode
        {...ORIGIN}
        color={BASE.color}
        name="Base"
        caption={account ? `You, ${short(account)}` : 'Your JAW account'}
        detail={props.originBalance && `${props.originBalance} USDC`}
        glyph="B"
        state={origin}
      />
      <ChainNode
        {...HUB}
        color={NEAR_GREEN}
        name="NEAR Intents"
        caption={depositAddress ? `Deposit to ${short(depositAddress)}` : 'Solvers fill the intent'}
        detail={hubStatus}
        glyph="N"
        state={hub}
        ink="#06140E"
      />
      <ChainNode
        {...TARGET}
        color={dest.color}
        name={dest.name}
        caption={account ? `You again, ${short(account)}` : 'You receive USDC'}
        detail={props.targetBalance && `${props.targetBalance} USDC`}
        glyph={dest.name[0]}
        state={target}
      />

      {phase === 'quoted' && <Flight key="pay" path={PATHS.pay} coins={1} />}
      {phase === 'bridging' && <Flight key="deposit" path={PATHS.deposit} />}
      {phase === 'delivered' && <Flight key="deliver" path={PATHS.deliver} />}
      {phase === 'refunded' && <Flight key="refund" path={PATHS.refund} />}
    </svg>
  );
}

interface ChainNodeProps {
  x: number;
  y: number;
  color: string;
  name: string;
  caption: string;
  detail?: string;
  glyph: string;
  state: NodeState;
  ink?: string;
}

function ChainNode({ x, y, color, name, caption, detail, glyph, state, ink = 'white' }: ChainNodeProps) {
  return (
    <g className={`chain ${state}`} style={{ '--c': color } as React.CSSProperties}>
      <circle cx={x} cy={y} r={90} fill="url(#glow)" className="halo" />
      <circle cx={x} cy={y} r={58} className="pulse" />
      {state === 'busy' && <circle cx={x} cy={y} r={58} className="orbit" />}
      <circle cx={x} cy={y} r={46} fill={color} />
      <text x={x} y={y + 12} textAnchor="middle" className="glyph" fill={ink}>{glyph}</text>
      <text x={x} y={y + 84} textAnchor="middle" className="node-name">{name}</text>
      <text x={x} y={y + 106} textAnchor="middle" className="node-caption">{caption}</text>
      {detail && <text x={x} y={y + 130} textAnchor="middle" className="node-detail">{detail}</text>}
    </g>
  );
}

function Flight({ path, coins = 3 }: { path: string; coins?: number }) {
  return Array.from({ length: coins }, (_, i) => <Coin key={i} path={path} delay={i * 0.22} />);
}

/** A USDC coin flying once along `path` and staying where it lands. */
function Coin({ path, delay }: { path: string; delay: number }) {
  const ref = useRef<SVGGElement>(null);

  useEffect(() => {
    // Starting the animation in the past lands the coin with no flight at all.
    const start = matchMedia('(prefers-reduced-motion: reduce)').matches ? -10 : delay;
    ref.current?.querySelectorAll<SVGAnimationElement>('animate, animateMotion').forEach((a) => a.beginElementAt(start));
  }, [delay]);

  return (
    <g ref={ref} opacity={0}>
      <circle r={13} fill={USDC_BLUE} stroke="white" strokeWidth={2.5} className="coin" />
      <text y={5} textAnchor="middle" className="coin-mark">$</text>
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.8;1" dur="1.5s" begin="indefinite" fill="freeze" />
      <animateMotion
        path={path}
        dur="1.5s"
        begin="indefinite"
        fill="freeze"
        calcMode="spline"
        keyTimes="0;1"
        keySplines="0.5 0 0.2 1"
      />
    </g>
  );
}
