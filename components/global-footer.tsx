'use client'

import Link from 'next/link'

export function GlobalFooter() {
  const enableRevenueShare = process.env.NEXT_PUBLIC_ENABLE_REVENUE_SHARE === 'true'
  
  return (
    <footer className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] text-[#a8a8b8] border-t border-[#9945FF]/20 mt-auto relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-[#9945FF]/20 rounded-full blur-3xl" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#14F195]/15 rounded-full blur-3xl" />
      </div>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand Section */}
          <div>
            <h3 className="text-2xl mb-4 font-black bg-gradient-to-r from-[#9945FF] via-[#00D4FF] to-[#14F195] bg-clip-text text-transparent animate-[solanaGradientShift_8s_ease_infinite] bg-[length:200%_auto]">
              SolMaker.Fun
            </h3>
            <p className="text-sm text-[#a8a8b8] font-medium leading-relaxed">
              AI-powered NFT creation platform on Solana. Build, launch, and grow your NFT collection.
            </p>
          </div>

          {/* Platform Links */}
          <div>
            <h4 className="text-white font-bold mb-5 text-lg">Platform</h4>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/" 
                  className="text-[#a8a8b8] hover:text-[#14F195] transition-all duration-300 text-sm font-medium flex items-center gap-2 group"
                >
                  <span className="group-hover:translate-x-1 transition-transform">🚀</span>
                  <span>Launchpad</span>
                </Link>
              </li>
              <li>
                <Link 
                  href="/marketplace" 
                  className="text-[#a8a8b8] hover:text-[#14F195] transition-all duration-300 text-sm font-medium flex items-center gap-2 group"
                >
                  <span className="group-hover:translate-x-1 transition-transform">💰</span>
                  <span>Marketplace</span>
                </Link>
              </li>
              <li>
                <Link 
                  href="/promotion" 
                  className="text-[#a8a8b8] hover:text-[#14F195] transition-all duration-300 text-sm font-medium flex items-center gap-2 group"
                >
                  <span className="group-hover:translate-x-1 transition-transform">📢</span>
                  <span>Promote</span>
                </Link>
              </li>
              <li>
                <Link 
                  href="/collections" 
                  className="text-[#a8a8b8] hover:text-[#14F195] transition-all duration-300 text-sm font-medium flex items-center gap-2 group"
                >
                  <span className="group-hover:translate-x-1 transition-transform">📁</span>
                  <span>Collections</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Features Links */}
          <div>
            <h4 className="text-white font-bold mb-5 text-lg">Features</h4>
            <ul className="space-y-3">
              {enableRevenueShare && (
                <>
                  <li>
                    <Link 
                      href="/revshare" 
                      className="text-[#a8a8b8] hover:text-[#14F195] transition-all duration-300 text-sm font-medium flex items-center gap-2 group"
                    >
                      <span className="group-hover:translate-x-1 transition-transform">💰</span>
                      <span>Revenue Share</span>
                    </Link>
                  </li>
                  <li>
                    <Link 
                      href="/pass-details" 
                      className="text-[#a8a8b8] hover:text-[#14F195] transition-all duration-300 text-sm font-medium flex items-center gap-2 group"
                    >
                      <span className="group-hover:translate-x-1 transition-transform">🎫</span>
                      <span>Pass Details</span>
                    </Link>
                  </li>
                </>
              )}
              <li>
                <Link 
                  href="/buy-credits" 
                  className="text-[#a8a8b8] hover:text-[#14F195] transition-all duration-300 text-sm font-medium flex items-center gap-2 group"
                >
                  <span className="group-hover:translate-x-1 transition-transform">💳</span>
                  <span>Buy Credits</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="text-white font-bold mb-5 text-lg">Legal</h4>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/terms" 
                  className="text-[#a8a8b8] hover:text-[#14F195] transition-all duration-300 text-sm font-medium flex items-center gap-2 group"
                >
                  <span className="group-hover:translate-x-1 transition-transform">📄</span>
                  <span>Terms and Conditions</span>
                </Link>
              </li>
              <li>
                <Link 
                  href="/privacy" 
                  className="text-[#a8a8b8] hover:text-[#14F195] transition-all duration-300 text-sm font-medium flex items-center gap-2 group"
                >
                  <span className="group-hover:translate-x-1 transition-transform">🔒</span>
                  <span>Privacy Policy</span>
                </Link>
              </li>
            </ul>
          </div>
      
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 pt-8 border-t border-[#9945FF]/20">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-5">
              {/* X (Twitter) Link */}
              <a
                href="https://x.com/solmakerfun"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#9945FF]/10 border border-[#9945FF]/30 hover:bg-[#9945FF]/20 hover:border-[#9945FF]/50 hover:scale-110 transition-all duration-300 group"
                aria-label="Follow us on X (Twitter)"
              >
                <svg
                  className="w-5 h-5 text-[#a8a8b8] group-hover:text-[#14F195] transition-colors"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <p className="text-xs text-[#a8a8b8] font-medium">
                © {new Date().getFullYear()} <span className="text-[#9945FF] font-bold">SolMaker.Fun</span>. All rights reserved.
              </p>
            </div>
            <p className="text-xs text-[#a8a8b8] font-medium">
              Built on <span className="text-[#14F195] font-bold">Solana</span> with ❤️
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

