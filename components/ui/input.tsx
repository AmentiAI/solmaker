import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'w-full px-4 py-3 h-12 min-w-0 rounded-xl',
        'bg-[var(--surface)] border-2 border-[var(--border)]',
        'text-white placeholder:text-[var(--text-muted)]',
        'transition-all duration-300 outline-none',
        'focus:border-[var(--solana-purple)] focus:ring-4 focus:ring-[var(--solana-purple)]/20',
        'hover:border-[var(--solana-purple)]/40',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground',
        'selection:bg-primary selection:text-primary-foreground',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
