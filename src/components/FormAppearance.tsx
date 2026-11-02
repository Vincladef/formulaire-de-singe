import type { ReactNode } from 'react';
import { readFormTheme, type FormTheme } from '../shared/theme';

export function FormAppearance({ theme, children, className = '' }: {
  theme?: FormTheme; children: ReactNode; className?: string;
}) {
  const t = readFormTheme(theme);
  return <div className={`form-theme form-accent-${t.accent} form-font-${t.font} form-bg-${t.background} form-button-${t.button} ${className}`}>
    {children}
  </div>;
}
