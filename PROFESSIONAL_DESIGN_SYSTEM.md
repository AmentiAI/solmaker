# Professional Solana Design System 🎨

## Design Philosophy

**Goal**: Create a premium, professional NFT platform that embodies Solana's brand identity while establishing a unique, modern aesthetic.

**Principles**:
- **Clean & Spacious**: Generous whitespace, clear hierarchy
- **Professional**: Enterprise-grade UI with attention to detail
- **Modern**: Contemporary design patterns and interactions
- **Branded**: Strong Solana identity throughout
- **Accessible**: WCAG AA compliant, keyboard navigation

---

## Color System

### Primary Colors (Solana Brand)
```css
--solana-purple: #9945FF        /* Primary brand color */
--solana-purple-dark: #7C3AED   /* Hover states, depth */
--solana-purple-light: #A855F7  /* Highlights, accents */

--solana-green: #14F195         /* Success, CTAs, accents */
--solana-green-dark: #10B981    /* Hover states */
--solana-green-light: #34D399   /* Highlights */
```

### Supporting Colors
```css
--solana-cyan: #00D4FF          /* Info, links */
--solana-pink: #DC1FFF          /* Special highlights */
```

### Neutral Colors (Professional Palette)
```css
--background: #0D0D11           /* Main background - deep space */
--surface: #121218              /* Card backgrounds */
--surface-elevated: #1A1A22     /* Elevated cards, modals */
--border: rgba(153, 69, 255, 0.2) /* Subtle borders */
--text-primary: #FFFFFF         /* Primary text */
--text-secondary: #A1A1AA       /* Secondary text */
--text-muted: #71717A           /* Muted text */
```

### Semantic Colors
```css
--success: #14F195
--warning: #FBBF24
--error: #EF4444
--info: #00D4FF
```

### Gradients
```css
--gradient-primary: linear-gradient(135deg, #9945FF 0%, #14F195 100%)
--gradient-purple: linear-gradient(135deg, #7C3AED 0%, #9945FF 50%, #DC1FFF 100%)
--gradient-green: linear-gradient(135deg, #10B981 0%, #14F195 100%)
--gradient-surface: linear-gradient(135deg, #121218 0%, #1A1A22 100%)
```

---

## Typography

### Font Stack
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Scale
```css
--text-xs: 0.75rem      /* 12px - Labels, captions */
--text-sm: 0.875rem     /* 14px - Body small */
--text-base: 1rem       /* 16px - Body text */
--text-lg: 1.125rem     /* 18px - Large body */
--text-xl: 1.25rem      /* 20px - Small headings */
--text-2xl: 1.5rem      /* 24px - Headings */
--text-3xl: 1.875rem    /* 30px - Large headings */
--text-4xl: 2.25rem     /* 36px - Hero headings */
--text-5xl: 3rem        /* 48px - Display */
--text-6xl: 3.75rem     /* 60px - Large display */
```

### Weights
```css
--font-normal: 400
--font-medium: 500
--font-semibold: 600
--font-bold: 700
--font-extrabold: 800
```

---

## Spacing System

### Base Unit: 4px
```css
--space-1: 0.25rem    /* 4px */
--space-2: 0.5rem     /* 8px */
--space-3: 0.75rem    /* 12px */
--space-4: 1rem       /* 16px */
--space-5: 1.25rem    /* 20px */
--space-6: 1.5rem     /* 24px */
--space-8: 2rem       /* 32px */
--space-10: 2.5rem    /* 40px */
--space-12: 3rem      /* 48px */
--space-16: 4rem      /* 64px */
--space-20: 5rem      /* 80px */
--space-24: 6rem      /* 96px */
```

---

## Component Design Patterns

### 1. Cards

#### Standard Card
```tsx
<Card className="bg-surface border border-border rounded-2xl p-6 hover:border-solana-purple/40 transition-all duration-300">
  {/* Content */}
</Card>
```

**Variants**:
- **Elevated**: `shadow-xl shadow-solana-purple/5`
- **Interactive**: `hover:scale-[1.02] cursor-pointer`
- **Featured**: `border-2 border-solana-purple/60 bg-gradient-to-br from-surface to-surface-elevated`

#### NFT Card (New Design)
```tsx
<div className="group relative">
  {/* Image Container */}
  <div className="aspect-square rounded-2xl overflow-hidden border-2 border-border">
    <img className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
    {/* Overlay on hover */}
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
  </div>
  
  {/* Info Section */}
  <div className="mt-4 space-y-3">
    <h3 className="text-lg font-semibold text-white">{name}</h3>
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">Price</span>
      <span className="text-xl font-bold text-solana-green">{price} SOL</span>
    </div>
  </div>
</div>
```

### 2. Buttons

#### Primary Button
```tsx
<button className="
  px-6 py-3 
  bg-gradient-to-r from-solana-purple to-solana-purple-light
  hover:from-solana-purple-dark hover:to-solana-purple
  text-white font-semibold
  rounded-xl
  shadow-lg shadow-solana-purple/30
  hover:shadow-xl hover:shadow-solana-purple/40
  transition-all duration-300
  hover:scale-105
  active:scale-95
">
  {children}
</button>
```

#### Secondary Button (Green)
```tsx
<button className="
  px-6 py-3
  bg-gradient-to-r from-solana-green to-solana-green-light
  hover:from-solana-green-dark hover:to-solana-green
  text-background font-semibold
  rounded-xl
  shadow-lg shadow-solana-green/30
  transition-all duration-300
">
  {children}
</button>
```

#### Outline Button
```tsx
<button className="
  px-6 py-3
  border-2 border-solana-purple/50
  hover:border-solana-purple
  hover:bg-solana-purple/10
  text-white font-semibold
  rounded-xl
  transition-all duration-300
">
  {children}
</button>
```

#### Ghost Button
```tsx
<button className="
  px-6 py-3
  hover:bg-surface
  text-text-secondary hover:text-white
  font-medium
  rounded-xl
  transition-all duration-300
">
  {children}
</button>
```

### 3. Inputs

#### Text Input
```tsx
<input className="
  w-full px-4 py-3
  bg-surface border-2 border-border
  focus:border-solana-purple focus:ring-4 focus:ring-solana-purple/20
  text-white placeholder:text-text-muted
  rounded-xl
  transition-all duration-300
  outline-none
" />
```

#### Search Input
```tsx
<div className="relative">
  <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
  <input className="
    w-full pl-12 pr-4 py-3
    bg-surface border-2 border-border
    focus:border-solana-purple
    text-white
    rounded-xl
  " />
</div>
```

### 4. Badges

#### Status Badge
```tsx
<span className="
  inline-flex items-center gap-1.5
  px-3 py-1.5
  bg-solana-green/10 border border-solana-green/30
  text-solana-green text-xs font-semibold
  rounded-full
">
  <div className="w-1.5 h-1.5 rounded-full bg-solana-green animate-pulse" />
  LIVE
</span>
```

#### Info Badge
```tsx
<span className="
  px-3 py-1
  bg-surface border border-border
  text-text-secondary text-xs font-medium
  rounded-full
">
  {text}
</span>
```

### 5. Navigation

#### Top Navigation (New Design)
```tsx
<nav className="
  sticky top-0 z-50
  bg-background/80 backdrop-blur-xl
  border-b border-border
">
  <div className="container mx-auto px-6">
    <div className="flex items-center justify-between h-20">
      {/* Logo */}
      <Logo />
      
      {/* Nav Items */}
      <div className="flex items-center gap-2">
        <NavLink active={isActive}>Marketplace</NavLink>
        <NavLink>Collections</NavLink>
        <NavLink>Launchpad</NavLink>
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-4">
        <WalletButton />
      </div>
    </div>
  </div>
</nav>
```

#### Nav Link
```tsx
<a className="
  px-4 py-2
  text-sm font-medium
  text-text-secondary hover:text-white
  hover:bg-surface
  rounded-lg
  transition-all duration-200
  
  /* Active state */
  [&.active]:text-white
  [&.active]:bg-gradient-to-r [&.active]:from-solana-purple/20 [&.active]:to-solana-green/20
  [&.active]:border [&.active]:border-solana-purple/30
">
  {children}
</a>
```

### 6. Modals

#### Modal Container
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
  
  {/* Modal */}
  <div className="
    relative w-full max-w-2xl
    bg-surface-elevated
    border-2 border-border
    rounded-3xl
    shadow-2xl shadow-solana-purple/10
    overflow-hidden
  ">
    {/* Header */}
    <div className="px-8 py-6 border-b border-border">
      <h2 className="text-2xl font-bold text-white">{title}</h2>
    </div>
    
    {/* Content */}
    <div className="px-8 py-6">
      {children}
    </div>
    
    {/* Footer */}
    <div className="px-8 py-6 border-t border-border bg-surface/50">
      {actions}
    </div>
  </div>
</div>
```

---

## Layout Patterns

### 1. Hero Section (Homepage)
```tsx
<section className="relative py-24 overflow-hidden">
  {/* Background Elements */}
  <div className="absolute inset-0">
    <div className="absolute top-20 left-20 w-96 h-96 bg-solana-purple/10 rounded-full blur-3xl" />
    <div className="absolute bottom-20 right-20 w-96 h-96 bg-solana-green/10 rounded-full blur-3xl" />
  </div>
  
  {/* Content */}
  <div className="container mx-auto px-6 relative z-10">
    <div className="max-w-4xl mx-auto text-center space-y-8">
      <h1 className="text-6xl font-extrabold text-white">
        Create & Mint NFTs on
        <span className="bg-gradient-to-r from-solana-purple to-solana-green bg-clip-text text-transparent">
          {' '}Solana
        </span>
      </h1>
      <p className="text-xl text-text-secondary max-w-2xl mx-auto">
        The fastest, most affordable NFT launchpad on Solana blockchain
      </p>
      <div className="flex items-center justify-center gap-4">
        <Button variant="primary">Get Started</Button>
        <Button variant="outline">Explore Collections</Button>
      </div>
    </div>
  </div>
</section>
```

### 2. Grid Layout (Collections/Marketplace)
```tsx
<div className="container mx-auto px-6 py-12">
  {/* Header */}
  <div className="flex items-center justify-between mb-8">
    <h2 className="text-3xl font-bold text-white">Collections</h2>
    <div className="flex items-center gap-4">
      <SearchInput />
      <FilterButton />
      <ViewToggle />
    </div>
  </div>
  
  {/* Grid */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {items.map(item => <NFTCard key={item.id} {...item} />)}
  </div>
</div>
```

### 3. Dashboard Layout (Admin/Profile)
```tsx
<div className="flex min-h-screen">
  {/* Sidebar */}
  <aside className="w-64 bg-surface border-r border-border">
    <Sidebar />
  </aside>
  
  {/* Main Content */}
  <main className="flex-1 bg-background">
    {/* Top Bar */}
    <div className="h-20 border-b border-border px-8 flex items-center justify-between">
      <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>
      <Actions />
    </div>
    
    {/* Content */}
    <div className="p-8">
      {children}
    </div>
  </main>
</div>
```

### 4. Detail Page Layout (NFT/Collection Detail)
```tsx
<div className="container mx-auto px-6 py-12">
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
    {/* Left: Media */}
    <div className="space-y-6">
      <div className="aspect-square rounded-3xl overflow-hidden border-2 border-border">
        <img src={image} className="w-full h-full object-cover" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {/* Thumbnails */}
      </div>
    </div>
    
    {/* Right: Info */}
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-white mb-4">{name}</h1>
        <p className="text-lg text-text-secondary">{description}</p>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard />
      </div>
      
      {/* Actions */}
      <div className="space-y-4">
        <Button variant="primary" size="lg" fullWidth>Mint Now</Button>
        <Button variant="outline" size="lg" fullWidth>Add to Wishlist</Button>
      </div>
    </div>
  </div>
</div>
```

---

## Animation System

### Transitions
```css
/* Standard */
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

/* Fast */
transition: all 0.15s ease-out;

/* Slow */
transition: all 0.5s ease-in-out;
```

### Hover Effects
```css
/* Scale up */
hover:scale-105

/* Lift */
hover:-translate-y-1 hover:shadow-xl

/* Glow */
hover:shadow-lg hover:shadow-solana-purple/30
```

### Keyframe Animations
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideIn {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
```

---

## Page-Specific Designs

### Homepage
- **Hero**: Large, centered, gradient text
- **Features**: 3-column grid with icons
- **Collections**: Horizontal scrolling carousel
- **Stats**: 4-column metrics
- **CTA**: Full-width gradient section

### Marketplace
- **Filters**: Left sidebar (desktop) or top (mobile)
- **Grid**: 4-column responsive grid
- **Sort**: Dropdown in header
- **Pagination**: Bottom center

### Collection Detail
- **2-column**: Image left, info right
- **Tabs**: Traits, Activity, About
- **Mint Section**: Prominent, sticky on scroll

### Profile/Dashboard
- **Sidebar**: Fixed navigation
- **Stats Cards**: Top row, 4 columns
- **Tables**: Full-width, sortable
- **Charts**: 2-column grid

### Admin
- **Dense Layout**: More information per screen
- **Data Tables**: Advanced filtering
- **Quick Actions**: Always visible
- **Status Indicators**: Color-coded

---

## Responsive Breakpoints

```css
/* Mobile First */
sm: 640px   /* Small tablets */
md: 768px   /* Tablets */
lg: 1024px  /* Small laptops */
xl: 1280px  /* Desktops */
2xl: 1536px /* Large desktops */
```

---

## Accessibility

### Focus States
```css
focus:outline-none
focus:ring-4 focus:ring-solana-purple/20
focus:border-solana-purple
```

### Keyboard Navigation
- All interactive elements focusable
- Visible focus indicators
- Logical tab order
- Skip links for navigation

### Screen Readers
- Semantic HTML
- ARIA labels where needed
- Alt text for images
- Descriptive button text

---

## Implementation Priority

### Phase 1: Foundation (Week 1)
1. Update global CSS with new color system
2. Redesign core components (Button, Card, Input)
3. Create new navigation component
4. Update typography system

### Phase 2: Key Pages (Week 2)
1. Homepage redesign
2. Marketplace redesign
3. Collection detail redesign
4. Profile/Dashboard redesign

### Phase 3: Secondary Pages (Week 3)
1. Launchpad pages
2. Admin pages
3. Utility pages (Buy Credits, etc.)
4. Error/Empty states

### Phase 4: Polish (Week 4)
1. Animations and transitions
2. Loading states
3. Mobile optimization
4. Accessibility audit

---

## Success Metrics

- **Visual Consistency**: 100% of pages follow design system
- **Performance**: No layout shifts, smooth 60fps animations
- **Accessibility**: WCAG AA compliance
- **Brand Identity**: Strong Solana presence throughout
- **User Experience**: Intuitive, professional, modern

---

**Status**: ✅ Design System Complete - Ready for Implementation
**Next Step**: Begin Phase 1 implementation
