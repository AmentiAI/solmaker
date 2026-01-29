// Credit pricing tiers - client-safe constants
export type CreditTier = {
  readonly credits: number
  readonly pricePerCredit: number
  readonly totalPrice: number
  readonly bestValue?: boolean
}

export const CREDIT_TIERS: CreditTier[] = [
  { credits: 10, pricePerCredit: 0.75, totalPrice: 7.50, bestValue: false },
  { credits: 25, pricePerCredit: 0.70, totalPrice: 17.50, bestValue: false },
  { credits: 50, pricePerCredit: 0.70, totalPrice: 35.00, bestValue: false },
  { credits: 100, pricePerCredit: 0.65, totalPrice: 65.00, bestValue: false },
  { credits: 300, pricePerCredit: 0.65, totalPrice: 195.00, bestValue: false },
  { credits: 500, pricePerCredit: 0.65, totalPrice: 325.00, bestValue: false },
  { credits: 1000, pricePerCredit: 0.60, totalPrice: 600.00, bestValue: false },
  { credits: 2500, pricePerCredit: 0.60, totalPrice: 1500.00, bestValue: false },
  { credits: 5000, pricePerCredit: 0.55, totalPrice: 2750.00, bestValue: true },
]

