import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import { ThemeProvider } from './ThemeContext';
import { WalletProvider } from './WalletContext';

function mount() {
  return render(
    <MemoryRouter>
      <ThemeProvider><WalletProvider><Navbar /></WalletProvider></ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  window.matchMedia = jest.fn(() => ({ matches: true }));
});

afterEach(() => {
  jest.restoreAllMocks();
  delete window.matchMedia;
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
});

test('desktop and mobile toggles switch from system dark to light and back, persisting the choice', () => {
  mount();
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  fireEvent.click(screen.getAllByRole('button', { name: 'Switch to light mode' })[0]);
  expect(document.documentElement.classList.contains('dark')).toBe(false);
  expect(localStorage.getItem('theme')).toBe('light');
  expect(document.documentElement.style.colorScheme).toBe('light');
  fireEvent.click(screen.getAllByRole('button', { name: 'Switch to dark mode' })[1]);
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(localStorage.getItem('theme')).toBe('dark');
});

test.each(['light', 'dark'])('restores saved %s without consulting system preference', (theme) => {
  localStorage.setItem('theme', theme);
  mount();
  expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark');
  expect(window.matchMedia).not.toHaveBeenCalled();
});

test('uses the system preference only at initialization', () => {
  localStorage.setItem('theme', 'invalid');
  window.matchMedia.mockReturnValue({ matches: false });
  mount();
  expect(document.documentElement.classList.contains('dark')).toBe(false);
  window.matchMedia.mockReturnValue({ matches: true });
  fireEvent.click(screen.getAllByRole('button', { name: 'Switch to dark mode' })[0]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Switch to light mode' })[0]);
  expect(document.documentElement.classList.contains('dark')).toBe(false);
  expect(window.matchMedia).toHaveBeenCalledTimes(1);
});

test('still toggles when localStorage access is blocked', () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  mount();
  fireEvent.click(screen.getAllByRole('button', { name: 'Switch to light mode' })[0]);
  expect(document.documentElement.classList.contains('dark')).toBe(false);
});
