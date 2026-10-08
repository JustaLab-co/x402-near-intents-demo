import type { NextConfig } from 'next';

// The JAW wallet signs inside an iframe from keys.jaw.id. Chrome only lets a
// cross-origin iframe use passkeys when the top page also allows it here.
const KEYS = '"https://keys.jaw.id"';

const config: NextConfig = {
  agentRules: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: `publickey-credentials-get=(self ${KEYS}), publickey-credentials-create=(self ${KEYS})`,
          },
        ],
      },
    ];
  },
};

export default config;
