const { ethers } = require('ethers');
const { provider, RPC_TIMEOUT_MS } = require('../config/blockchain');

// Bound the whole ethers operation, including any sequential internal RPC calls.
function withRpcDeadline(operation) {
  return async (...args) => {
    let timer;
    try {
      return await Promise.race([
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error('Blockchain RPC request timed out');
            error.statusCode = 504;
            reject(error);
          }, RPC_TIMEOUT_MS);
        }),
        Promise.resolve().then(() => operation(...args)),
      ]);
    } catch (error) {
      if (error.statusCode) throw error;
      // ethers can wrap transport errors in CALL_EXCEPTION or SERVER_ERROR.
      let cause = error;
      while (cause && cause.code !== 'TIMEOUT') cause = cause.error || cause.serverError;
      const rpcError = new Error(cause ? 'Blockchain RPC request timed out' : 'Blockchain RPC request failed');
      rpcError.statusCode = cause ? 504 : 502;
      throw rpcError;
    } finally {
      clearTimeout(timer);
    }
  };
}

async function getNetwork() {
  const network = await provider.getNetwork();
  const blockNumber = await provider.getBlockNumber();

  return {
    name: network.name,
    chainId: network.chainId,
    blockNumber,
  };
}

async function getBalance(address) {
  if (!ethers.utils.isAddress(address)) {
    const error = new Error('Invalid wallet address');
    error.statusCode = 400;
    throw error;
  }

  const balance = await provider.getBalance(address);

  return {
    address,
    balanceWei: balance.toString(),
    balanceEth: ethers.utils.formatEther(balance),
  };
}

async function readContract({ contractAddress, abi, method, args = [] } = {}) {
  if (!ethers.utils.isAddress(contractAddress)) {
    const error = new Error('Invalid contract address');
    error.statusCode = 400;
    throw error;
  }

  if (!Array.isArray(abi) || typeof method !== 'string' || !method || !Array.isArray(args)) {
    const error = new Error('ABI, method and an args array are required');
    error.statusCode = 400;
    throw error;
  }

  let contractInterface;
  let fragment;
  let data;
  try {
    contractInterface = new ethers.utils.Interface(abi);
    fragment = contractInterface.getFunction(method);
    data = contractInterface.encodeFunctionData(fragment, args);
  } catch {
    const error = new Error('Invalid ABI, contract method or arguments');
    error.statusCode = 400;
    throw error;
  }

  const response = await provider.call({ to: contractAddress, data }, 'latest');
  const result = contractInterface.decodeFunctionResult(fragment, response);

  // Match Contract's single-output unwrapping and keep multi-output results.
  return normalizeResult(result.length === 1 ? result[0] : result);
}

function normalizeResult(value) {
  if (ethers.BigNumber.isBigNumber(value)) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeResult);
  }

  if (value && typeof value === 'object') {
    const result = {};

    Object.keys(value)
      .filter((key) => Number.isNaN(Number(key)))
      .forEach((key) => {
        result[key] = normalizeResult(value[key]);
      });

    return Object.keys(result).length > 0 ? result : value;
  }

  return value;
}

module.exports = {
  getNetwork: withRpcDeadline(getNetwork),
  getBalance: withRpcDeadline(getBalance),
  readContract: withRpcDeadline(readContract),
};
