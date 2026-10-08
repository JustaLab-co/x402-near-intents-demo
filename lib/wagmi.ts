import { createConfig, http } from 'wagmi';
import { arbitrum, base, bsc, mainnet, optimism, polygon } from 'wagmi/chains';
import { jaw } from '@jaw.id/wagmi';

export const config = createConfig({
  chains: [base, arbitrum, optimism, polygon, mainnet, bsc],
  connectors: [
    jaw({
      apiKey: process.env.NEXT_PUBLIC_JAW_API_KEY!,
      appName: 'x402 x NEAR Intents',
      defaultChainId: base.id,
    }),
  ],
  transports: {
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [mainnet.id]: http(),
    [bsc.id]: http(),
  },
  // Keeps injected wallets (Rabby, MetaMask) out of the connector list.
  multiInjectedProviderDiscovery: false,
  ssr: true,
});
