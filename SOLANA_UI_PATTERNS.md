# Solana UI Patterns - Quick Reference

## Common Replacements for All Pages

### Background Colors
```tsx
// OLD
className="bg-[#0a0a0a]"
className="bg-[#1a1a1a]"
className="min-h-screen"

// NEW
className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]"
className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90"
className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]"
```

### Border Colors
```tsx
// OLD
border-[#222]
border-[#333]
border-[#444]

// NEW
border-[#9945FF]/20
border-[#9945FF]/30
border-[#9945FF]/50
```

### Text Colors
```tsx
// OLD
text-[#999]
text-[#666]
text-white

// NEW
text-[#a8a8b8]
text-[#a8a8b8]/80
text-white
```

### Buttons
```tsx
// OLD
className="px-6 py-3 bg-[#9945FF] hover:bg-[#7C3AED] text-white rounded-lg"

// NEW
className="px-8 py-3 bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] hover:from-[#DC1FFF] hover:to-[#9945FF] text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-[#9945FF]/40 hover:shadow-xl hover:shadow-[#9945FF]/50 hover:scale-105 active:scale-95"
```

### Cards
```tsx
// OLD
className="bg-[#1a1a1a] border border-[#333] rounded-xl"

// NEW
className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md shadow-xl shadow-[#9945FF]/10 hover:border-[#9945FF]/50 hover:shadow-2xl hover:shadow-[#9945FF]/15 transition-all duration-300"
```

### Headers/Titles
```tsx
// OLD
<h1 className="text-4xl font-bold text-white">Title</h1>

// NEW
<h1 className="text-5xl md:text-6xl font-black bg-gradient-to-r from-[#9945FF] via-[#00D4FF] to-[#14F195] bg-clip-text text-transparent animate-[solanaGradientShift_8s_ease_infinite] bg-[length:200%_auto]">
  Title
</h1>
```

### Inputs
```tsx
// OLD
className="px-4 py-2 border border-[#333] bg-[#1a1a1a] rounded-lg"

// NEW
className="px-5 py-3 rounded-xl border-2 border-[#9945FF]/30 bg-gradient-to-r from-[#14141e]/90 to-[#1a1a24]/90 backdrop-blur-md shadow-lg shadow-[#9945FF]/10 focus:border-[#9945FF] focus:ring-2 focus:ring-[#9945FF]/50 transition-all duration-300"
```

### Badges/Tags
```tsx
// OLD
className="px-3 py-1 bg-[#9945FF]/20 text-[#9945FF] rounded-full text-xs"

// NEW
className="px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-[#9945FF]/20 to-[#DC1FFF]/20 border border-[#9945FF]/40 text-[#9945FF] backdrop-blur-sm"
```

### Loading States
```tsx
// OLD
<div className="w-16 h-16 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin" />

// NEW
<div className="relative w-20 h-20">
  <div className="absolute inset-0 border-4 border-[#9945FF]/20 rounded-full" />
  <div className="absolute inset-0 border-4 border-[#9945FF] border-t-transparent rounded-full animate-spin" />
  <div className="absolute inset-2 border-4 border-[#14F195]/20 rounded-full" />
  <div className="absolute inset-2 border-4 border-[#14F195] border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
</div>
```

### Empty States
```tsx
// OLD
<div className="py-12 text-center text-[#999] bg-[#1a1a1a] border border-[#333] rounded-xl">
  No items found
</div>

// NEW
<div className="py-20 text-center bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-2xl backdrop-blur-md">
  <div className="text-6xl mb-6 opacity-50 animate-[solanaFloat_4s_ease-in-out_infinite]">📦</div>
  <h3 className="text-2xl font-black text-white mb-3">No Items Found</h3>
  <p className="text-[#a8a8b8] text-lg font-medium">Description here</p>
</div>
```

### Hover Effects
```tsx
// Add to interactive elements
hover:scale-105
hover:shadow-xl
hover:shadow-[#9945FF]/50
transition-all duration-300
```

### Page Container Pattern
```tsx
<div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]">
  {/* Page Header */}
  <SolanaPageHeader 
    title="Page Title"
    description="Page description"
  />
  
  {/* Page Content */}
  <div className="container mx-auto px-6 py-8">
    {/* Content here */}
  </div>
</div>
```

## Component Imports
Add to pages that need them:
```tsx
import { SolanaPageHeader, SolanaEmptyState, SolanaLoadingState, SolanaCard, SolanaBadge } from '@/components/solana-page-header'
```
