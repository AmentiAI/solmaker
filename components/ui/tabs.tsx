'use client'

import * as React from 'react'

interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined)

function useTabsContext() {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within Tabs')
  }
  return context
}

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

export function Tabs({ value, onValueChange, children, className = '' }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

interface TabsListProps {
  children: React.ReactNode
  className?: string
}

export function TabsList({ children, className = '' }: TabsListProps) {
  return (
    <div className={`flex border-b border-[#9945FF]/20 ${className}`}>
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function TabsTrigger({ value, children, className = '' }: TabsTriggerProps) {
  const { value: selectedValue, onValueChange } = useTabsContext()
  const isActive = selectedValue === value

  return (
    <button
      onClick={() => onValueChange(value)}
      className={`
        flex-1 px-6 py-4 text-center font-semibold transition-all duration-300 relative
        ${isActive
          ? 'text-white bg-gradient-to-r from-[#9945FF]/10 to-[#14F195]/10'
          : 'text-[#A1A1AA] hover:text-white hover:bg-[#1A1A22]'
        }
        ${className}
      `}
    >
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#9945FF] to-[#14F195]" />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function TabsContent({ value, children, className = '' }: TabsContentProps) {
  const { value: selectedValue } = useTabsContext()

  if (selectedValue !== value) {
    return null
  }

  return <div className={className}>{children}</div>
}
