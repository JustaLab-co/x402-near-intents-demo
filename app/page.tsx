'use client';

import { useState } from 'react';
import { erc20Abi, formatUnits, type Address } from 'viem';
import { useBytecode, useConnect, useConnection, useConnectors, useDisconnect, useReadContract } from 'wagmi';
import { Console } from '@/components/console';
import { NetworkStage } from '@/components/network-stage';
import { BASE, DESTINATIONS, type Network } from '@/lib/chains';
import { useSwapFlow } from '@/lib/use-swap-flow';

const RUNNING = ['activating', 'paying', 'depositing', 'bridging'];

function useUsdcBalance(network: Network, owner?: Address) {
  const { data } = useReadContract({
    address: network.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: owner && [owner],
    chainId: network.id,
    query: { enabled: !!owner, refetchInterval: 5000 },
  });
  return data === undefined ? undefined : Number(formatUnits(data, network.decimals)).toFixed(4);
}

function currentStep(phase: string) {
  if (phase === 'idle' || phase === 'paying' || phase === 'failed') return 0;
  if (phase === 'quoted' || phase === 'depositing') return 1;
  if (phase === 'bridging') return 2;
  return 3;
}

export default function Home() {
  const { address, isConnected } = useConnection();
  const jaw = useConnectors().find((c) => c.type === 'jaw');
  const connect = useConnect();
  const disconnect = useDisconnect();
  const { phase, lines, quote, status, payTo, activate, getQuote, swap } = useSwapFlow();
  const code = useBytecode({ address, chainId: BASE.id, query: { enabled: !!address } });
  const needsActivation = isConnected && code.isFetched && !code.data;

  const [destId, setDestId] = useState(DESTINATIONS[0].id);
  const [amount, setAmount] = useState('1');
  const dest = DESTINATIONS.find((d) => d.id === destId)!;
  const running = RUNNING.includes(phase);
  const expectedOut = quote && formatUnits(BigInt(quote.expectedOutputAmount), dest.decimals);
  const originBalance = useUsdcBalance(BASE, address);
  const targetBalance = useUsdcBalance(dest, address);
  const step = currentStep(phase);

  const steps = [
    `Buy the quote. The API answers 402 Payment Required, your passkey signs 0.005 USDC to the API's wallet, and the same request returns a quote.`,
    `Deposit. You send ${amount} USDC to a one-time NEAR Intents deposit address on Base.`,
    `Receive. A NEAR Intents solver sends USDC to your same address on ${dest.name}. You never touch NEAR.`,
  ];

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1>x402 × NEAR Intents</h1>
          <p className="lede">
            Pay for a swap quote over plain HTTP, then move USDC from Base to {dest.name}. NEAR Intents settles
            the swap in between, so there is no bridge to trust and nothing to hold on NEAR.
          </p>
        </div>
        {isConnected ? (
          <div className="account">
            <span className="addr">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
            <button className="link" onClick={() => disconnect.mutate()}>Disconnect</button>
          </div>
        ) : (
          <div className="account">
            {connect.error && <span className="error">{connect.error.message.split('\n')[0]}</span>}
            <button className="primary" disabled={!jaw || connect.isPending} onClick={() => jaw && connect.mutate({ connector: jaw })}>
              {connect.isPending ? 'Connecting…' : 'Connect with JAW'}
            </button>
          </div>
        )}
      </header>

      <NetworkStage
        phase={phase}
        dest={dest}
        amount={amount}
        expectedOut={expectedOut}
        hubStatus={phase === 'bridging' ? (status?.state ?? 'KNOWN_DEPOSIT_TX') : undefined}
        account={address}
        payTo={payTo}
        depositAddress={quote?.quoteId.split(':')[1] as Address | undefined}
        originBalance={originBalance}
        targetBalance={targetBalance}
      />

      <ol className="steps">
        {steps.map((text, i) => (
          <li key={i} className={i === step ? 'now' : i < step ? 'past' : undefined}>
            {text}
          </li>
        ))}
      </ol>

      <div className="controls">
        <label className="field">
          <span>Send</span>
          <input
            inputMode="decimal"
            value={amount}
            disabled={running || phase === 'quoted'}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          <span>USDC from Base</span>
        </label>
        <label className="field">
          <span>to</span>
          <select value={destId} disabled={running || phase === 'quoted'} onChange={(e) => setDestId(Number(e.target.value))}>
            {DESTINATIONS.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>

        {needsActivation ? (
          <button className="primary" disabled={running} onClick={() => activate().then(() => code.refetch())}>
            {phase === 'activating' ? 'Activating…' : 'Activate account on Base'}
          </button>
        ) : phase === 'quoted' ? (
          <button className="primary" onClick={() => swap(dest)}>
            Swap {amount} USDC to {dest.name}
          </button>
        ) : (
          <button className="primary" disabled={!isConnected || running || !Number(amount)} onClick={() => getQuote(dest, amount)}>
            {phase === 'paying' ? 'Paying for the quote…' : 'Get a quote for 0.005 USDC'}
          </button>
        )}
      </div>

      {quote && (
        <p className="summary">
          You receive about {expectedOut} USDC on {dest.name} in ~{quote.expectedFillTimeSec} s, at least{' '}
          {formatUnits(BigInt(quote.minOutputAmount), dest.decimals)}.
          {quote.fees.totalUsd && ` Network fees: $${Number(quote.fees.totalUsd).toFixed(4)}.`}
        </p>
      )}

      <Console lines={lines} active={running} />
    </main>
  );
}
