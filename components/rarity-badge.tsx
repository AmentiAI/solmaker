import { Badge } from "@/components/ui/badge"
import { Sparkles, Star, Gem, Crown } from "lucide-react"
import type { TraitRarity } from "@/lib/trait-generator"

interface RarityBadgeProps {
  rarity: TraitRarity
  score?: number
  size?: "sm" | "md" | "lg"
}

const rarityConfig: Record<
  TraitRarity,
  {
    label: string
    icon: typeof Sparkles
    className: string
  }
> = {
  common: {
    label: "Common",
    icon: Sparkles,
    className: "bg-gray-500/30 text-gray-100 dark:text-gray-100 border-gray-400/50 shadow-lg",
  },
  rare: {
    label: "Rare",
    icon: Star,
    className: "bg-blue-500/40 text-blue-100 dark:text-blue-100 border-blue-400/60 shadow-lg shadow-blue-500/20",
  },
  epic: {
    label: "Epic",
    icon: Gem,
    className:
      "bg-purple-500/40 text-purple-100 dark:text-purple-100 border-purple-400/60 shadow-lg shadow-purple-500/20",
  },
  legendary: {
    label: "Legendary",
    icon: Crown,
    className: "bg-amber-500/50 text-amber-100 dark:text-amber-100 border-amber-400/70 shadow-lg shadow-amber-500/30",
  },
}

export function RarityBadge({ rarity, score, size = "md" }: RarityBadgeProps) {
  const config = rarityConfig[rarity]
  const Icon = config.icon

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-1.5",
  }

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  }

  return (
    <Badge variant="outline" className={`${config.className} ${sizeClasses[size]} gap-1.5 font-semibold`}>
      <Icon className={iconSizes[size]} />
      {config.label}
      {score !== undefined && <span className="ml-1">({score})</span>}
    </Badge>
  )
}
