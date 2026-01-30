import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-[var(--solana-purple)]/20 focus-visible:border-[var(--solana-purple)] relative overflow-hidden",
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-r from-[var(--solana-purple)] to-[var(--solana-purple-light)] hover:from-[var(--solana-purple-dark)] hover:to-[var(--solana-purple)] text-white shadow-lg shadow-[var(--solana-purple)]/30 hover:shadow-xl hover:shadow-[var(--solana-purple)]/40 hover:scale-105 active:scale-95',
        secondary:
          'bg-gradient-to-r from-[var(--solana-green)] to-[var(--solana-green-light)] hover:from-[var(--solana-green-dark)] hover:to-[var(--solana-green)] text-[var(--background)] font-semibold shadow-lg shadow-[var(--solana-green)]/30 hover:shadow-xl hover:shadow-[var(--solana-green)]/40 hover:scale-105 active:scale-95',
        outline:
          'border-2 border-[var(--solana-purple)]/50 hover:border-[var(--solana-purple)] hover:bg-[var(--solana-purple)]/10 text-white font-semibold hover:scale-105 active:scale-95',
        ghost:
          'hover:bg-[var(--surface)] text-[var(--text-secondary)] hover:text-white font-medium',
        destructive:
          'bg-gradient-to-r from-[var(--error)] to-[#dc2626] text-white shadow-lg shadow-[var(--error)]/30 hover:shadow-xl hover:shadow-[var(--error)]/40 hover:scale-105 active:scale-95',
        link: 'text-[var(--solana-purple)] underline-offset-4 hover:underline hover:text-[var(--solana-purple-light)]',
      },
      size: {
        default: 'h-11 px-6 py-3',
        sm: 'h-9 rounded-lg px-4 text-xs',
        lg: 'h-14 rounded-xl px-8 text-base',
        icon: 'size-11',
        'icon-sm': 'size-9',
        'icon-lg': 'size-14',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
