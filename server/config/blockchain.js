const { ethers } = require('ethers');

const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arbitrum-one-rpc.publicnode.com';
const RPC_TIMEOUT_MS = 10000;

const connection = {
  url: RPC_URL,
  timeout: RPC_TIMEOUT_MS,
  // Do not wait through a public endpoint's rate-limit backoff.
  throttleCallback: () => false,
};

const provider = new ethers.providers.StaticJsonRpcProvider(connection, {
  name: 'arbitrum',
  chainId: 42161,
});

module.exports = {
  provider,
  RPC_URL,
  RPC_TIMEOUT_MS,
};
