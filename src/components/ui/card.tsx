import type { ComponentProps } from 'react';
import { cn } from './utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-[22px] border border-[#e2e7df] bg-white shadow-[0_18px_55px_-36px_#1f3930]', className)} {...props} />;
}
