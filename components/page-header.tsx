interface PageHeaderProps {
  title: string
  subtitle: string
  action?: React.ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="relative bg-[#0a0a0a] text-white border-b border-[#404040] px-6 lg:px-12">
      <div className="w-full py-8 lg:py-12 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-wide uppercase text-[#D4AF37] mb-3">
              {title}
            </h1>
            <p className="text-[#808080] text-base lg:text-lg font-medium">
              {subtitle}
            </p>
          </div>
          {action && (
            <div className="flex items-center gap-3">
              {action}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
