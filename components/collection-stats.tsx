"use client"

import { Card } from "@/components/ui/card"
import { Sparkles, TrendingUp, Award, Layers } from "lucide-react"
import type { Ordinal } from "@/types/ordinal"
import type { TraitRarity } from "@/lib/trait-generator"

interface CollectionStatsProps {
  ordinals: Ordinal[]
}

const COLLECTION_GOAL = 2500
const LEGENDARY_GOAL = 50

export function CollectionStats({ ordinals }: CollectionStatsProps) {
  const totalCount = ordinals.length

  if (totalCount === 0) return null

  // Calculate rarity distribution
  const rarityDistribution = ordinals.reduce(
    (acc, ordinal) => {
      if (ordinal.rarityTier) {
        acc[ordinal.rarityTier] = (acc[ordinal.rarityTier] || 0) + 1
      }
      return acc
    },
    {} as Record<TraitRarity, number>,
  )

  // Calculate average rarity score
  const avgRarityScore = ordinals.reduce((sum, ordinal) => sum + (ordinal.rarityScore || 0), 0) / totalCount || 0

  // Find highest rarity
  const highestRarity = ordinals.reduce((max, ordinal) => {
    return (ordinal.rarityScore || 0) > (max.rarityScore || 0) ? ordinal : max
  }, ordinals[0])

  const legendaryCount = rarityDistribution.legendary || 0
  const legendaryPercent = ((legendaryCount / LEGENDARY_GOAL) * 100).toFixed(1)

  const stats = [
    {
      label: "Total Collection",
      value: `${totalCount} / ${COLLECTION_GOAL}`,
      icon: Layers,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Legendary Count",
      value: `${legendaryCount} / ${LEGENDARY_GOAL}`,
      subtext: `${legendaryPercent}% of goal`,
      icon: Sparkles,
      color: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Avg Rarity Score",
      value: avgRarityScore.toFixed(1),
      icon: TrendingUp,
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      label: "Highest Score",
      value: highestRarity.rarityScore || 0,
      subtext: `#${highestRarity.number}`,
      icon: Award,
      color: "text-green-600 dark:text-green-400",
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xl font-bold truncate">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                {stat.subtext && <p className="text-xs text-muted-foreground mt-0.5">{stat.subtext}</p>}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
