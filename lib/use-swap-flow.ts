'use client';

import { useState } from 'react';
import { erc20Abi, formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { useConfig, useConnection, useSendCalls, useSignTypedData, useSwitchChain } from 'wagmi';
import { getBytecode, readContract, waitForCallsStatus } from 'wagmi/actions';
import { BASE, type Network } from './chains';
import {
  depositUrls,
  quoteUrl,
  TERMINAL_STATES,
  unwrap,
  type DepositStatus,
  type Quote,
} from './proxy';
import { authorizationTypedData, buildAuthorization, decodeChallenge, encodePayment, pickRequirement } from './x402';

export type Phase =
  | 'idle'
  | 'activating'
  | 'paying'
  | 'quoted'
  | 'depositing'
  | 'bridging'
  | 'delivered'
  | 'refunded'
  | 'failed';

export interface Line {
  id: number;
  at: Date;
  kind: 'out' | 'in' | 'challenge' | 'note' | 'error';
  text: string;
  detail?: unknown;
  href?: string;
}

const POLL_MS = 3000;
// 0.005 USDC, what the proxy charges per quote.
const QUOTE_PRICE = 5000n;
// Ten minutes of polling covers a slow fill; past that the deposit is still
// trackable, the page just stops asking.
const POLL_LIMIT = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (hex: string) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;

export function useSwapFlow() {
  const config = useConfig();
  const { address } = useConnection();
  const switchChain = useSwitchChain();
  const signTypedData = useSignTypedData();
  const sendCalls = useSendCalls();

  const [phase, setPhase] = useState<Phase>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [quote, setQuote] = useState<Quote>();
  const [status, setStatus] = useState<DepositStatus>();
  const [payTo, setPayTo] = useState<Address>();

  const say = (kind: Line['kind'], text: string, extra: Pick<Line, 'detail' | 'href'> = {}) =>
    setLines((all) => [...all, { id: all.length, at: new Date(), kind, text, ...extra }]);

  async function guarded(step: () => Promise<void>) {
    try {
      await step();
    } catch (e) {
      say('error', e instanceof Error ? e.message.split('\n')[0] : String(e), { detail: e });
      setPhase('failed');
    }
  }

  /** Deploys the account on Base with an empty call to itself, so USDC can verify its signatures. */
  const activate = () =>
    guarded(async () => {
      if (!address) throw new Error('Connect a JAW account first');
      setPhase('activating');
      await switchChain.mutateAsync({ chainId: BASE.id });
      say('note', 'Waiting for a passkey signature to deploy the account on Base');
      const { id } = await sendCalls.mutateAsync({ calls: [{ to: address, value: 0n }], chainId: BASE.id });
      say('out', 'wallet_sendCalls: empty call to self, which deploys the account', { detail: { id } });
      const { receipts } = await waitForCallsStatus(config, { id });
      const txHash = receipts?.[0]?.transactionHash;
      say('in', `Account deployed on Base${txHash ? ` in ${short(txHash)}` : ''}`, {
        href: txHash && `${BASE.explorer}/tx/${txHash}`,
      });
      setPhase('idle');
    });

  const getQuote = (dest: Network, amount: string) =>
    guarded(async () => {
      if (!address) throw new Error('Connect a JAW account first');
      setLines([]);
      setQuote(undefined);
      setStatus(undefined);
      setPhase('paying');

      // USDC checks the payment signature against the account contract, so the
      // account has to exist on Base and hold enough for the quote and the swap.
      const needed = parseUnits(amount, BASE.decimals) + QUOTE_PRICE;
      const [code, balance] = await Promise.all([
        getBytecode(config, { address, chainId: BASE.id }),
        readContract(config, { address: BASE.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address], chainId: BASE.id }),
      ]);
      if (balance < needed) {
        throw new Error(
          `${short(address)} holds ${formatUnits(balance, 6)} USDC on Base and needs ${formatUnits(needed, 6)}. Fund it and try again.`,
        );
      }
      if (!code) {
        throw new Error(
          `${short(address)} is not deployed on Base yet, so USDC cannot verify its signature. Activate it first.`,
        );
      }

      const url = quoteUrl({
        originChainId: String(BASE.id),
        destinationChainId: String(dest.id),
        originToken: BASE.usdc,
        destinationToken: dest.usdc,
        amount: parseUnits(amount, BASE.decimals).toString(),
        depositor: address,
        recipient: address,
      });

      say('out', 'GET /proxy/v2/swap/quote', { detail: Object.fromEntries(new URL(url).searchParams) });
      const unpaid = await fetch(url);
      if (unpaid.status !== 402) throw new Error(`Expected 402, got ${unpaid.status}: ${await unpaid.text()}`);
      const challenge = decodeChallenge(unpaid);
      const req = pickRequirement(challenge);
      setPayTo(req.payTo);
      say('challenge', `402 Payment Required, as expected: the API asks ${formatUnits(BigInt(req.amount), 6)} USDC on Base, paid to ${short(req.payTo)}`, {
        detail: challenge,
      });

      // JAW binds the ERC-7739 signature envelope to the connected chain.
      await switchChain.mutateAsync({ chainId: BASE.id });
      say('note', 'Waiting for a passkey signature on the USDC authorization');
      const auth = buildAuthorization(req, address);
      const signature = await signTypedData.mutateAsync(authorizationTypedData(req, auth));
      say('note', 'Signed EIP-3009 transferWithAuthorization', { detail: { authorization: auth, signature } });

      say('out', 'GET /proxy/v2/swap/quote with PAYMENT-SIGNATURE');
      const paid = await fetch(url, { headers: { 'PAYMENT-SIGNATURE': encodePayment(req, auth, signature) } });
      if (paid.status === 402) {
        // A refused payment comes back as a fresh challenge whose `error` says why.
        const refusal = decodeChallenge(paid);
        say('error', `Payment refused: ${refusal.error ?? 'no reason given'}`, { detail: refusal });
        setPhase('failed');
        return;
      }
      const receiptHeader = paid.headers.get('payment-response');
      const receipt = receiptHeader ? JSON.parse(atob(receiptHeader)) : null;
      const q = await unwrap<Quote>(paid);
      if (receipt?.transaction) {
        say('in', `Payment settled on Base in ${short(receipt.transaction)}`, {
          detail: receipt,
          href: `${BASE.explorer}/tx/${receipt.transaction}`,
        });
      }
      say('in', `200 OK: ${formatUnits(BigInt(q.expectedOutputAmount), dest.decimals)} USDC expected on ${dest.name}`, {
        detail: q,
      });
      setQuote(q);
      setPhase('quoted');
    });

  const swap = (dest: Network) =>
    guarded(async () => {
      if (!quote) return;
      setPhase('depositing');
      const depositAddress = quote.quoteId.split(':')[1] as Address;

      say('note', `Waiting for a passkey signature on the deposit to ${short(depositAddress)}`);
      const calls = quote.transactions.map((t) => ({ to: t.to, data: t.data, value: BigInt(t.value) }));
      const { id } = await sendCalls.mutateAsync({ calls, chainId: BASE.id });
      say('out', 'wallet_sendCalls: deposit on Base', { detail: { id, calls: quote.transactions } });

      const { receipts } = await waitForCallsStatus(config, { id });
      const txHash = receipts?.[0]?.transactionHash as Hex | undefined;
      if (!txHash) throw new Error('The deposit has no transaction hash');
      say('in', `Deposit confirmed on Base in ${short(txHash)}`, { href: `${BASE.explorer}/tx/${txHash}` });

      say('out', 'POST /proxy/v2/move-asset/deposit/submit');
      const submitted = await unwrap<DepositStatus>(
        await fetch(depositUrls.submit, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'aurora', depositAddress, txHash }),
        }),
      );
      say('in', `NEAR Intents knows the deposit: ${submitted.state}`, { detail: submitted });
      setPhase('bridging');

      let last = submitted.state;
      for (let i = 0; i < POLL_LIMIT && !TERMINAL_STATES.includes(last); i++) {
        await sleep(POLL_MS);
        const s = await unwrap<DepositStatus>(await fetch(depositUrls.status(depositAddress)));
        setStatus(s);
        if (s.state !== last) say('in', `GET /deposit/status: ${s.state}`, { detail: s });
        last = s.state;
      }

      if (last === 'SUCCESS') {
        say('note', `Delivered on ${dest.name}`, { href: `${dest.explorer}/address/${address}#tokentxns` });
        setPhase('delivered');
      } else if (last === 'REFUNDED' || last === 'INCOMPLETE_DEPOSIT') {
        say('note', `The deposit came back to Base: ${last}`);
        setPhase('refunded');
      } else if (last === 'FAILED') {
        throw new Error('NEAR Intents reported the swap as FAILED');
      } else {
        throw new Error(`Stopped watching at ${last}. The deposit keeps settling; check it again later.`);
      }
    });

  return { phase, lines, quote, status, payTo, activate, getQuote, swap };
}
