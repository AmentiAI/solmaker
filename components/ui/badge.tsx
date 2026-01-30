import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none transition-all duration-300',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--solana-purple)]/10 border border-[var(--solana-purple)]/30 text-[var(--solana-purple)] [a&]:hover:bg-[var(--solana-purple)]/20',
        secondary:
          'bg-[var(--solana-green)]/10 border border-[var(--solana-green)]/30 text-[var(--solana-green)] [a&]:hover:bg-[var(--solana-green)]/20',
        success:
          'bg-[var(--success)]/10 border border-[var(--success)]/30 text-[var(--success)] [a&]:hover:bg-[var(--success)]/20',
        warning:
          'bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-[var(--warning)] [a&]:hover:bg-[var(--warning)]/20',
        destructive:
          'bg-[var(--error)]/10 border border-[var(--error)]/30 text-[var(--error)] [a&]:hover:bg-[var(--error)]/20',
        outline:
          'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] [a&]:hover:bg-[var(--surface-elevated)] [a&]:hover:text-white',
        info:
          'bg-[var(--info)]/10 border border-[var(--info)]/30 text-[var(--info)] [a&]:hover:bg-[var(--info)]/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
