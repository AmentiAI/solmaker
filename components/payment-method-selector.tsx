'use client'

export type PaymentMethod = 'btc'

interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod
  onMethodChange: (method: PaymentMethod) => void
  disabled?: boolean
}

export function PaymentMethodSelector({
  selectedMethod,
  onMethodChange,
  disabled = false,
}: PaymentMethodSelectorProps) {
  const methods: Array<{ id: PaymentMethod; name: string; icon: string; description: string }> = [
    {
      id: 'btc',
      name: 'Bitcoin',
      icon: '₿',
      description: '~10 min confirmation',
    },
  ]

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Payment Method
      </label>
      <div className="grid grid-cols-2 gap-3">
        {methods.map((method) => (
          <button
            key={method.id}
            type="button"
            onClick={() => !disabled && onMethodChange(method.id)}
            disabled={disabled}
            className={`
              relative flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all
              ${
                selectedMethod === method.id
                  ? 'border-[#4561ad] bg-[#4561ad]/10 shadow-lg shadow-[#4561ad]/20'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
            `}
          >
            <div className="text-3xl mb-2">{method.icon}</div>
            <div className="text-sm font-semibold text-white">{method.name}</div>
            <div className="text-xs text-gray-400 mt-1">{method.description}</div>
            {selectedMethod === method.id && (
              <div className="absolute top-2 right-2">
                <div className="w-3 h-3 bg-[#4561ad] rounded-full"></div>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
