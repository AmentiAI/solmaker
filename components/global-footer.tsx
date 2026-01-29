'use client'

import Link from 'next/link'

export function GlobalFooter() {
  return (
    <footer className="bg-[#0a0a0a] text-[#999] border-t border-[#222] mt-auto">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div>
            <h3 className="text-lg mb-4 font-bold bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">SolMaker.Fun</h3>
            <p className="text-sm text-[#999]">
              AI-powered NFT creation platform on Solana
            </p>
          </div>

          {/* Platform Links */}
          <div>
            <h4 className="text-white font-semibold mb-4">Platform</h4>
            <ul className="space-y-2">
              <li>
                <Link 
                  href="/" 
                  className="text-[#999] hover:text-white transition-colors text-sm"
                >
                  🚀 Launchpad
                </Link>
              </li>
              <li>
                <Link 
                  href="/marketplace" 
                  className="text-[#999] hover:text-white transition-colors text-sm"
                >
                  💰 Marketplace
                </Link>
              </li>
              <li>
                <Link 
                  href="/promotion" 
                  className="text-[#999] hover:text-white transition-colors text-sm"
                >
                  📢 Promote
                </Link>
              </li>
              <li>
                <Link 
                  href="/collections" 
                  className="text-[#999] hover:text-white transition-colors text-sm"
                >
                  📁 Collections
                </Link>
              </li>
            </ul>
          </div>

          {/* Features Links */}
          <div>
            <h4 className="text-white font-semibold mb-4">Features</h4>
            <ul className="space-y-2">
              <li>
                <Link 
                  href="/revshare" 
                  className="text-[#999] hover:text-white transition-colors text-sm"
                >
                  💰 Revenue Share
                </Link>
              </li>
              <li>
                <Link 
                  href="/pass-details" 
                  className="text-[#999] hover:text-white transition-colors text-sm"
                >
                  🎫 Pass Details
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="text-white font-semibold mb-4">Legal</h4>
            <ul className="space-y-2">
              <li>
                <Link 
                  href="/terms" 
                  className="text-[#999] hover:text-white transition-colors text-sm"
                >
                  Terms and Conditions
                </Link>
              </li>
              <li>
                <Link 
                  href="/privacy" 
                  className="text-[#999] hover:text-white transition-colors text-sm"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
      
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8 border-t border-[#333]">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              {/* X (Twitter) Link */}
              <a
                href="https://x.com/solmakerfun"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-8 h-8 hover:opacity-80 transition-opacity"
                aria-label="Follow us on X (Twitter)"
              >
                <svg
                  className="w-6 h-6 text-[#999] hover:text-white transition-colors"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <p className="text-xs text-[#666]">
                © {new Date().getFullYear()} SolMaker.Fun. All rights reserved.
              </p>
            </div>
            <p className="text-xs text-[#666]">
              Use of this platform constitutes acceptance of our Terms and Conditions.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

