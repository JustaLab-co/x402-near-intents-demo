import type { Address } from 'viem';

export interface Network {
  id: number;
  name: string;
  color: string;
  usdc: Address;
  decimals: number;
  explorer: string;
}

export const BASE: Network = {
  id: 8453,
  name: 'Base',
  color: '#0052FF',
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
  explorer: 'https://basescan.org',
};

// Every destination here answered the paid route with a 402, which means the
// proxy found a NEAR Intents route for USDC from Base.
export const DESTINATIONS: Network[] = [
  {
    id: 42161,
    name: 'Arbitrum',
    color: '#28A0F0',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    decimals: 6,
    explorer: 'https://arbiscan.io',
  },
  {
    id: 10,
    name: 'Optimism',
    color: '#FF0420',
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    decimals: 6,
    explorer: 'https://optimistic.etherscan.io',
  },
  {
    id: 137,
    name: 'Polygon',
    color: '#8247E5',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    decimals: 6,
    explorer: 'https://polygonscan.com',
  },
  {
    id: 1,
    name: 'Ethereum',
    color: '#8A92B2',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
    explorer: 'https://etherscan.io',
  },
  {
    id: 56,
    name: 'BNB Chain',
    color: '#F0B90B',
    usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    decimals: 18,
    explorer: 'https://bscscan.com',
  },
];
