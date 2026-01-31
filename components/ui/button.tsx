import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-[var(--solana-purple)]/30 focus-visible:border-[var(--solana-purple)] relative overflow-hidden group",
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-r from-[#9945FF] via-[#DC1FFF] to-[#9945FF] bg-[length:200%_100%] text-white shadow-lg shadow-[#9945FF]/50 hover:shadow-2xl hover:shadow-[#9945FF]/70 hover:scale-105 hover:bg-[position:100%_0] active:scale-95 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700',
        secondary:
          'bg-gradient-to-r from-[#14F195] via-[#10B981] to-[#14F195] bg-[length:200%_100%] text-black font-extrabold shadow-lg shadow-[#14F195]/50 hover:shadow-2xl hover:shadow-[#14F195]/70 hover:scale-105 hover:bg-[position:100%_0] active:scale-95',
        outline:
          'border-2 border-[#9945FF]/60 hover:border-[#9945FF] hover:bg-gradient-to-r hover:from-[#9945FF]/20 hover:to-[#DC1FFF]/20 text-white font-bold hover:scale-105 hover:shadow-xl hover:shadow-[#9945FF]/40 active:scale-95 backdrop-blur-sm',
        ghost:
          'hover:bg-gradient-to-r hover:from-[#9945FF]/15 hover:to-[#DC1FFF]/15 text-[#B4B4C8] hover:text-white font-semibold hover:scale-105 active:scale-95',
        destructive:
          'bg-gradient-to-r from-[#EF4444] via-[#DC2626] to-[#EF4444] bg-[length:200%_100%] text-white shadow-lg shadow-red-500/50 hover:shadow-2xl hover:shadow-red-500/70 hover:scale-105 hover:bg-[position:100%_0] active:scale-95',
        link: 'text-[#9945FF] underline-offset-4 hover:underline hover:text-[#A855F7] hover:drop-shadow-[0_0_10px_rgba(153,69,255,0.8)]',
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
