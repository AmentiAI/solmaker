import Link from 'next/link'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-[#222] bg-[#0a0a0a] mt-auto h-[140px] flex items-center">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* Left side - Branding */}
          <div className="text-center md:text-left">
            <p className="text-[#999] text-sm">
              © {currentYear} SolMaker.Fun
            </p>
            <p className="text-[#666] text-xs mt-1">
              Built with Next.js, Solana, and OpenAI
            </p>
          </div>

          {/* Center - Links */}
          <div className="flex gap-6 text-sm">
            <Link 
              href="/collections" 
              className="text-[#999] hover:text-white transition-colors"
            >
              Collections
            </Link>
            <Link 
              href="/collections/create" 
              className="text-[#999] hover:text-white transition-colors"
            >
              Create
            </Link>
            <Link 
              href="/collections/advanced" 
              className="text-[#999] hover:text-white transition-colors"
            >
              Advanced
            </Link>
          </div>

          {/* Right side - Additional info */}
          <div className="text-center md:text-right">
            <p className="text-[#666] text-xs">
              AI-powered trait generation
            </p>
            <p className="text-[#666] text-xs mt-1">
              v1.0.0
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

