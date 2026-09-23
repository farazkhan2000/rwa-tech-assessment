import { createContext, useContext, useEffect, useState } from 'react';
import { ethers } from 'ethers';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const syncWallet = async () => {
    if (!window.ethereum) return;

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
      const accounts = await provider.send('eth_accounts', []);

      if (accounts.length > 0) {
        setAccount(accounts[0]);
        const network = await provider.getNetwork();
        setChainId(network.chainId);
      } else {
        setAccount(null);
        setChainId(null);
      }
    } catch (err) {
      console.error('Failed to sync wallet:', err);
    }
  };

  const connectWallet = async () => {
    if (connecting) return;
    if (!window.ethereum) {
      setError('MetaMask or another compatible wallet was not detected.');
      return;
    }

    try {
      setConnecting(true);
      setError('');

      const provider = new ethers.providers.Web3Provider(window.ethereum, 'any');

      const accounts = await provider.send('eth_requestAccounts', []);

      setAccount(accounts[0] || null);
      if (!accounts.length) {
        setChainId(null);
        return;
      }
      const network = await provider.getNetwork();

      setChainId(network.chainId);
    } catch (err) {
      console.error('Wallet connection failed:', err);

      if (err.code === 4001) {
        setError('Wallet connection was rejected.');
      } else if (err.code === -32002) {
        setError('A wallet connection request is already pending. Open your wallet to approve it.');
      } else {
        setError('Unable to connect wallet.');
      }
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    syncWallet();

    const ethereum = window.ethereum;
    if (!ethereum?.on) return;

    const handleAccountsChanged = (accounts) => {
      setError('');
      if (accounts.length === 0) {
        setAccount(null);
        setChainId(null);
      } else {
        setAccount(accounts[0]);
        syncWallet();
      }
    };

    const handleChainChanged = () => {
      syncWallet();
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
      ethereum.removeListener?.('chainChanged', handleChainChanged);
    };
  }, []);

  return (
    <WalletContext.Provider
      value={{
        account,
        chainId,
        connecting,
        error,
        connectWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
