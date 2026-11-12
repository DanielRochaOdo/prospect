'use client';

import {useEffect, useState} from 'react';
import {Moon, Sun} from 'lucide-react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'prospect-odontoart-theme';

export default function ThemeToggle({compact = false}: {compact?: boolean}) {
  const [theme, setTheme] = useState<Theme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const applied = document.documentElement.dataset.theme;
    setTheme(applied === 'dark' ? 'dark' : 'light');
    setReady(true);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Preferências podem estar bloqueadas pelo navegador. */ }
    setTheme(next);
  }

  const dark = theme === 'dark';
  return <button
    type="button"
    className={`theme-toggle ${compact ? 'compact' : ''}`}
    onClick={toggleTheme}
    aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'}
    aria-pressed={dark}
    title={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
    suppressHydrationWarning
  >
    <Sun size={17} aria-hidden="true" className={!dark ? 'theme-icon selected' : 'theme-icon'}/>
    <span className="theme-toggle-track" aria-hidden="true"><span className="theme-toggle-knob"/></span>
    <Moon size={17} aria-hidden="true" className={dark ? 'theme-icon selected' : 'theme-icon'}/>
    {!compact && <span className="theme-toggle-label">{ready ? (dark ? 'Escuro' : 'Claro') : 'Tema'}</span>}
  </button>;
}
