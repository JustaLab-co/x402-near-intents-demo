import type { Address, Hex } from 'viem';

export const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL ?? 'https://api.justaname.id';

export interface Quote {
  quoteId: string;
  provider: string;
  inputAmount: string;
  expectedOutputAmount: string;
  minOutputAmount: string;
  expectedFillTimeSec: number;
  fees: { totalUsd?: string };
  transactions: { chainId: number; to: Address; data: Hex; value: string; description?: string }[];
}

export type DepositState =
  | 'PENDING_DEPOSIT'
  | 'KNOWN_DEPOSIT_TX'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'INCOMPLETE_DEPOSIT'
  | 'REFUNDED'
  | 'FAILED';

export interface DepositStatus {
  provider: string;
  depositAddress: Address;
  state: DepositState;
  txHash?: Hex;
  rawState?: string;
}

export const TERMINAL_STATES: DepositState[] = ['SUCCESS', 'INCOMPLETE_DEPOSIT', 'REFUNDED', 'FAILED'];

export function quoteUrl(params: Record<string, string>): string {
  return `${PROXY_URL}/proxy/v2/swap/quote?${new URLSearchParams(params)}`;
}

/** The proxy wraps every success as { result: { data } } and every failure as { message }. */
export async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
  return body.result.data;
}

export const depositUrls = {
  submit: `${PROXY_URL}/proxy/v2/move-asset/deposit/submit`,
  status: (depositAddress: Address) =>
    `${PROXY_URL}/proxy/v2/move-asset/deposit/status?${new URLSearchParams({ provider: 'aurora', depositAddress })}`,
};
