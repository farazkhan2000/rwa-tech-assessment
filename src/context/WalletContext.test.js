import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { WalletProvider, useWallet } from './WalletContext';
import { ThemeProvider } from './ThemeContext';

const address = '0x1234567890123456789012345678901234567890';
const otherAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
let accounts;
let chainId;
let listeners;

function Chain() {
  const wallet = useWallet();
  return <output data-testid="chain">{wallet.chainId}</output>;
}

function mount() {
  return render(
    <MemoryRouter>
      <ThemeProvider><WalletProvider><Navbar /><Chain /></WalletProvider></ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  accounts = [];
  chainId = '0x1';
  listeners = {};
  window.ethereum = {
    request: jest.fn(async ({ method }) => {
      if (method === 'eth_requestAccounts') {
        accounts = [address];
        return accounts;
      }
      if (method === 'eth_accounts') return accounts;
      if (method === 'eth_chainId') return chainId;
      throw new Error(`Unexpected method: ${method}`);
    }),
    on: jest.fn((event, listener) => { listeners[event] = listener; }),
    removeListener: jest.fn(),
  };
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete window.ethereum;
  jest.restoreAllMocks();
});

test('connects only on click and keeps accounts and chain in sync', async () => {
  const { unmount } = mount();
  await waitFor(() => expect(window.ethereum.request).toHaveBeenCalledWith({ method: 'eth_accounts', params: [] }));
  expect(window.ethereum.request.mock.calls.some(([request]) => request.method === 'eth_requestAccounts')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByRole('button', { name: '0x1234...7890' });
  await waitFor(() => expect(screen.getByTestId('chain').textContent).toBe('1'));
  accounts = [otherAddress];
  act(() => listeners.accountsChanged(accounts));
  await screen.findByRole('button', { name: '0xabcd...abcd' });
  chainId = '0x89';
  act(() => listeners.chainChanged(chainId));
  await waitFor(() => expect(screen.getByTestId('chain').textContent).toBe('137'));
  accounts = [];
  act(() => listeners.accountsChanged(accounts));
  expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();
  expect(screen.getByTestId('chain').textContent).toBe('');
  unmount();
  expect(window.ethereum.removeListener).toHaveBeenCalledTimes(2);
});

test('shows a useful message when no injected wallet is available', () => {
  delete window.ethereum;
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  expect(screen.getByRole('alert').textContent).toMatch(/not detected/);
});

test('restores an authorized account without opening the wallet', async () => {
  accounts = [address];
  mount();
  await screen.findByRole('button', { name: '0x1234...7890' });
  expect(window.ethereum.request.mock.calls.some(([request]) => request.method === 'eth_requestAccounts')).toBe(false);
});

test.each([
  [4001, /rejected/],
  [-32002, /already pending/],
])('shows wallet error %s and allows retry', async (code, message) => {
  const request = window.ethereum.request;
  window.ethereum.request = jest.fn((args) => args.method === 'eth_requestAccounts'
    ? Promise.reject({ code }) : request(args));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(message);
  expect(screen.getByRole('button', { name: 'Connect' }).disabled).toBe(false);
});
