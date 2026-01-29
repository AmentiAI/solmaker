'use client'

import { Toaster } from 'sonner'

export function SonnerToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'border border-gray-200 bg-white text-gray-900',
          title: 'font-bold',
          description: 'text-gray-600',
        },
      }}
    />
  )
}


