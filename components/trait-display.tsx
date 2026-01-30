import { Badge } from "@/components/ui/badge"
import type { NftTraits } from "@/lib/types"
import type { TraitRarity } from "@/lib/trait-generator"

interface TraitDisplayProps {
  traits: NftTraits
  showRarity?: boolean
}

const rarityColors: Record<TraitRarity, string> = {
  common: "bg-gray-500/10 text-gray-700 dark:text-white border-[#9945FF]/40/20",
  rare: "bg-blue-500/10 text-[#14F195] dark:text-blue-300 border-blue-500/20",
  epic: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  legendary: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
}

export function TraitDisplay({ traits, showRarity = false }: TraitDisplayProps) {
  return (
    <div className="space-y-1 text-sm">
      <div>
        <span className="text-muted-foreground">characterType:</span>
        <span className="ml-2 font-medium">{traits.characterType}</span>
      </div>
      <div>
        <span className="text-muted-foreground">background:</span>
        <span className="ml-2 font-medium">{traits.background}</span>
      </div>
      <div>
        <span className="text-muted-foreground">accessories:</span>
        <span className="ml-2 font-medium">{traits.accessories}</span>
      </div>
      <div>
        <span className="text-muted-foreground">eyes:</span>
        <span className="ml-2 font-medium">{traits.eyes}</span>
      </div>
      <div>
        <span className="text-muted-foreground">mouth:</span>
        <span className="ml-2 font-medium">{traits.mouth}</span>
      </div>
      <div>
        <span className="text-muted-foreground">headwear:</span>
        <span className="ml-2 font-medium">{traits.headwear}</span>
      </div>
      <div>
        <span className="text-muted-foreground">outfits:</span>
        <span className="ml-2 font-medium">{traits.outfits}</span>
      </div>
      <div>
        <span className="text-muted-foreground">props:</span>
        <span className="ml-2 font-medium">{traits.props}</span>
      </div>
    </div>
  )
}
