# PowerShell script to update all files to NFT theme
# Replaces Solana colors with NFT colors and Ordinal with NFT

$rootPath = "C:\Users\Wilso\ordmakerfun-1"
$extensions = @("*.tsx", "*.ts", "*.css", "*.json", "*.md")

Write-Host "🎨 Starting NFT Theme Update..." -ForegroundColor Cyan
Write-Host ""

# Color replacements
$colorReplacements = @{
    # Solana to NFT color mappings
    "#9945FF" = "#00E5FF"
    "#7C3AED" = "#00B8D4"
    "#DC1FFF" = "#FF006E"
    "#14F195" = "#FFD60A"
    "#19FB9B" = "#00FFA3"
    "#00D4FF" = "#B537F2"
    
    # Background colors
    "0a0a0f" = "050510"
    "14141e" = "0f0f1e"
    "1a1a24" = "15152a"
    
    # Text colors
    "a8a8b8" = "b4b4c8"
    
    # Animation names
    "solanaGlow" = "nftGlow"
    "solanaPulse" = "nftPulse"
    "solanaGradientShift" = "nftGradientShift"
    "solanaBorderGlow" = "nftBorderGlow"
    "solanaFloat" = "nftFloat"
    "solanaShimmer" = "nftShimmer"
    
    # Class names
    "solana-glow" = "nft-glow"
    "solana-card" = "nft-card"
    "solana-border" = "nft-border"
    "btn-solana" = "btn-nft"
    "badge-solana" = "badge-nft"
    "text-solana" = "text-nft"
}

# Word replacements
$wordReplacements = @{
    "Ordinal" = "NFT"
    "ordinal" = "nft"
    "ORDINAL" = "NFT"
    "Ordinals" = "NFTs"
    "ordinals" = "nfts"
    "ORDINALS" = "NFTS"
}

$filesUpdated = 0
$totalReplacements = 0

foreach ($ext in $extensions) {
    $files = Get-ChildItem -Path $rootPath -Filter $ext -Recurse -ErrorAction SilentlyContinue | 
             Where-Object { $_.FullName -notmatch "node_modules|\.next|\.git" }
    
    foreach ($file in $files) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        
        $originalContent = $content
        $fileReplacements = 0
        
        # Apply color replacements
        foreach ($old in $colorReplacements.Keys) {
            $new = $colorReplacements[$old]
            if ($content -match [regex]::Escape($old)) {
                $content = $content -replace [regex]::Escape($old), $new
                $fileReplacements++
            }
        }
        
        # Apply word replacements
        foreach ($old in $wordReplacements.Keys) {
            $new = $wordReplacements[$old]
            if ($content -match "\b$old\b") {
                $content = $content -replace "\b$old\b", $new
                $fileReplacements++
            }
        }
        
        # Save if changes were made
        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            $filesUpdated++
            $totalReplacements += $fileReplacements
            $relativePath = $file.FullName.Replace($rootPath, "").TrimStart("\")
            Write-Host "✅ Updated: $relativePath ($fileReplacements changes)" -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "🎉 Complete!" -ForegroundColor Cyan
Write-Host "Files Updated: $filesUpdated" -ForegroundColor Yellow
Write-Host "Total Replacements: $totalReplacements" -ForegroundColor Yellow
