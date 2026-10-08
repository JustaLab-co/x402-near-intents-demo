import type { Address, Hex } from 'viem';

// x402 v2 wire format, client side. Spec:
// https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md

export interface PaymentRequirement {
  scheme: string;
  network: string;
  amount: string;
  asset: Address;
  payTo: Address;
  maxTimeoutSeconds: number;
  extra?: { name?: string; version?: string };
}

export interface PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: { url: string; description?: string };
  accepts: PaymentRequirement[];
}

export interface Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

export const BASE_USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export function decodeChallenge(res: Response): PaymentRequired {
  const header = res.headers.get('payment-required');
  if (!header) throw new Error('402 without a PAYMENT-REQUIRED header');
  return JSON.parse(atob(header));
}

/** Picks the USDC-on-Base option and refuses anything else, so the server cannot make us sign for another token. */
export function pickRequirement(challenge: PaymentRequired): PaymentRequirement {
  const req = challenge.accepts.find((a) => a.scheme === 'exact' && a.network === 'eip155:8453');
  if (!req) throw new Error('No exact USDC-on-Base option in the challenge');
  if (req.asset.toLowerCase() !== BASE_USDC.toLowerCase()) {
    throw new Error(`Challenge asks for ${req.asset}, which is not USDC on Base`);
  }
  return req;
}

export function buildAuthorization(req: PaymentRequirement, from: Address): Authorization {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  return {
    from,
    to: req.payTo,
    value: req.amount,
    // Ten minutes of slack for a wallet clock that runs a little ahead.
    validAfter: String(now - 600),
    validBefore: String(now + req.maxTimeoutSeconds),
    nonce: `0x${Array.from(nonce, (b) => b.toString(16).padStart(2, '0')).join('')}`,
  };
}

/** EIP-712 payload for USDC's EIP-3009 transferWithAuthorization. */
export function authorizationTypedData(req: PaymentRequirement, auth: Authorization) {
  return {
    domain: {
      name: req.extra?.name ?? 'USD Coin',
      version: req.extra?.version ?? '2',
      chainId: 8453,
      verifyingContract: req.asset,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      ...auth,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
    },
  } as const;
}

/** Value of the PAYMENT-SIGNATURE header. v2 uses standard base64, not base64url. */
export function encodePayment(req: PaymentRequirement, auth: Authorization, signature: Hex): string {
  return btoa(JSON.stringify({ x402Version: 2, accepted: req, payload: { signature, authorization: auth } }));
}
