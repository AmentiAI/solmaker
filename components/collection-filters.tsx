"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { X } from "lucide-react"
import type { TraitRarity } from "@/lib/trait-generator"

export type SortOption = "newest" | "oldest" | "rarity-high" | "rarity-low" | "number-asc" | "number-desc"

interface CollectionFiltersProps {
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
  rarityFilter: TraitRarity | "all"
  onRarityFilterChange: (rarity: TraitRarity | "all") => void
  totalCount: number
  filteredCount: number
}

export function CollectionFilters({
  sortBy,
  onSortChange,
  rarityFilter,
  onRarityFilterChange,
  totalCount,
  filteredCount,
}: CollectionFiltersProps) {
  const hasActiveFilters = rarityFilter !== "all"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Showing {filteredCount} of {totalCount} NFTs
          </span>
          {hasActiveFilters && (
            <Badge
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80"
              onClick={() => onRarityFilterChange("all")}
            >
              Clear filters
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px] space-y-2">
          <Label htmlFor="sort-by">Sort By</Label>
          <Select value={sortBy} onValueChange={(value) => onSortChange(value as SortOption)}>
            <SelectTrigger id="sort-by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="rarity-high">Rarity: High to Low</SelectItem>
              <SelectItem value="rarity-low">Rarity: Low to High</SelectItem>
              <SelectItem value="number-asc">Number: Low to High</SelectItem>
              <SelectItem value="number-desc">Number: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[200px] space-y-2">
          <Label htmlFor="rarity-filter">Filter by Rarity</Label>
          <Select value={rarityFilter} onValueChange={(value) => onRarityFilterChange(value as TraitRarity | "all")}>
            <SelectTrigger id="rarity-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rarities</SelectItem>
              <SelectItem value="common">Common</SelectItem>
              <SelectItem value="rare">Rare</SelectItem>
              <SelectItem value="epic">Epic</SelectItem>
              <SelectItem value="legendary">Legendary</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
