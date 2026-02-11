"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useWallet } from '@/lib/wallet/compatibility'

interface ProcessResult {
  analysis: string
  chromaticPrompt: string
  chromaticImageUrl: string
  originalUploadUrl?: string
  instructions?: string
  backgroundMode?: "original" | "transparent"
}

export default function StickerMakerPage() {
  const { isConnected, currentAddress } = useWallet()
  
  // Determine active wallet (Bitcoin only)
  const { activeWalletAddress, activeWalletConnected } = useMemo(() => {
    if (currentAddress && isConnected) {
      return { activeWalletAddress: currentAddress, activeWalletConnected: true }
    }
    return { activeWalletAddress: null, activeWalletConnected: false }
  }, [currentAddress, isConnected])
  
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [customInstructions, setCustomInstructions] = useState("")
  const [backgroundMode, setBackgroundMode] = useState<"original" | "transparent">("transparent")
  const [credits, setCredits] = useState<number | null>(null)
  const [loadingCredits, setLoadingCredits] = useState(false)

  const MAX_IMAGES = 4
  const CREDITS_PER_STICKER = 1.5

  // Load credits
  useEffect(() => {
    const loadCredits = async () => {
      if (!activeWalletAddress) {
        setCredits(null)
        return
      }

      setLoadingCredits(true)
      try {
        const response = await fetch(`/api/credits?wallet_address=${encodeURIComponent(activeWalletAddress)}`)
        if (response.ok) {
          const data = await response.json()
          const creditsValue = data.credits
          // Ensure credits is a number
          const numCredits = typeof creditsValue === 'number' 
            ? creditsValue 
            : (typeof creditsValue === 'string' ? parseFloat(creditsValue) || 0 : 0)
          setCredits(numCredits)
        } else {
          setCredits(0)
        }
      } catch (error) {
        console.error('Error loading credits:', error)
        setCredits(0)
      } finally {
        setLoadingCredits(false)
      }
    }

    if (activeWalletConnected && activeWalletAddress) {
      loadCredits()
    } else {
      setCredits(null)
    }
  }, [activeWalletConnected, activeWalletAddress])

  // Listen for credit refresh events
  useEffect(() => {
    const handleRefreshCredits = async () => {
      if (!activeWalletAddress) return
      setLoadingCredits(true)
      try {
        const response = await fetch(`/api/credits?wallet_address=${encodeURIComponent(activeWalletAddress)}`)
        if (response.ok) {
          const data = await response.json()
          const creditsValue = data.credits
          // Ensure credits is a number
          const numCredits = typeof creditsValue === 'number' 
            ? creditsValue 
            : (typeof creditsValue === 'string' ? parseFloat(creditsValue) || 0 : 0)
          setCredits(numCredits)
        }
      } catch (error) {
        console.error('Error refreshing credits:', error)
      } finally {
        setLoadingCredits(false)
      }
    }

    window.addEventListener('refreshCredits', handleRefreshCredits)
    return () => {
      window.removeEventListener('refreshCredits', handleRefreshCredits)
    }
  }, [activeWalletAddress])

  useEffect(() => {
    if (selectedFiles.length === 0) {
      setPreviewUrls([])
      return
    }

    const urls = selectedFiles.map(file => URL.createObjectURL(file))
    setPreviewUrls(urls)

    return () => {
      urls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [selectedFiles])

  const formattedAnalysis = useMemo(() => {
    if (!result?.analysis) return ""

    return result.analysis
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .join("\n\n")
  }, [result?.analysis])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    
    if (files.length === 0) {
      setSelectedFiles([])
      return
    }

    // Check maximum image limit
    if (files.length > MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} images allowed. You selected ${files.length} images. Please select ${MAX_IMAGES} or fewer.`)
      setSelectedFiles([])
      return
    }

    const validFiles: File[] = []
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError(`"${file.name}" is not a valid image file.`)
        continue
      }

      if (file.size > 12 * 1024 * 1024) {
        setError(`"${file.name}" is too large. Images must be 12MB or smaller.`)
        continue
      }

      validFiles.push(file)
    }

    if (validFiles.length === 0) {
      setSelectedFiles([])
      return
    }

    setError(null)
    setResult(null)
    setSelectedFiles(validFiles)
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setResult(null)
  }

  const handleProcess = async () => {
    if (selectedFiles.length === 0) {
      setError("Please select at least one image to process.")
      return
    }

    if (selectedFiles.length > MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} images allowed. You selected ${selectedFiles.length} images.`)
      return
    }

    if (!activeWalletConnected || !activeWalletAddress) {
      setError("Please connect your wallet to use Sticker Creator Beta.")
      return
    }

    // Check if user has enough credits
    if (credits !== null && typeof credits === 'number' && credits < CREDITS_PER_STICKER) {
      const creditsDisplay = typeof credits === 'number' ? credits.toFixed(1) : '0'
      setError(`Insufficient credits. You need ${CREDITS_PER_STICKER} credit${CREDITS_PER_STICKER > 1 ? 's' : ''} to generate a sticker. You have ${creditsDisplay} credit${credits !== 1 ? 's' : ''}. Please purchase credits.`)
      return
    }

    try {
      setIsProcessing(true)
      setError(null)

      const formData = new FormData()
      selectedFiles.forEach((file, index) => {
        formData.append(`image${index}`, file)
      })
      formData.append("imageCount", selectedFiles.length.toString())
      formData.append("instructions", customInstructions)
      formData.append("backgroundMode", backgroundMode)
      formData.append("wallet_address", activeWalletAddress)

      let response: Response
      try {
        response = await fetch("/api/sticker-maker", {
          method: "POST",
          body: formData,
        })
      } catch (fetchError) {
        console.error("[sticker-maker] Network error:", fetchError)
        if (fetchError instanceof TypeError && fetchError.message === "Failed to fetch") {
          throw new Error(
            "Unable to connect to the server. Please check your connection and try again."
          )
        }
        throw new Error(
          `Network error: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`
        )
      }

      if (!response.ok) {
        let errorData: any = {}
        try {
          errorData = await response.json()
        } catch (parseError) {
          try {
            const text = await response.text()
            errorData = { error: text || `Server error (status ${response.status})` }
          } catch {
            errorData = { error: `Server error (status ${response.status})` }
          }
        }
        
        const errorMessage = errorData?.error || errorData?.details || `Failed to process image (status ${response.status})`
        const errorCode = errorData?.code || ''
        
        if (errorCode === 'moderation_blocked' || errorMessage.includes('safety system')) {
          throw new Error(
            'Content was blocked by safety filters. Please try adjusting your instructions or use a different image.'
          )
        }
        
        throw new Error(errorMessage)
      }

      const data = (await response.json()) as ProcessResult
      setResult(data)
      setLastUpdated(new Date().toLocaleString())
      
      // Trigger credit refresh after successful generation
      window.dispatchEvent(new CustomEvent('refreshCredits'))
    } catch (processError) {
      console.error("[sticker-maker] process error:", processError)
      setError(
        processError instanceof Error
          ? processError.message
          : "Failed to process the image. Please try again.",
      )
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative bg-gradient-to-r from-[#0a0e27]/90 via-[#1a1f3a]/90 to-[#0f172a]/90 text-white border-b border-[#9945FF]/30">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-white">Sticker Creator</h1>
              <p className="text-[#a5b4fc] mt-1 sm:mt-2 text-sm sm:text-base md:text-lg">
                Transform any image into a sticker with transparent backgrounds
              </p>
            </div>
            <div className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] text-xs sm:text-sm font-bold shadow-lg shadow-[#00E5FF]/20 whitespace-nowrap">
              {CREDITS_PER_STICKER} credit{CREDITS_PER_STICKER > 1 ? 's' : ''} / sticker
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="w-full">

        {!activeWalletConnected && (
          <div className="rounded-lg border border-[#DC1FFF]/50 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-4 text-[#DC1FFF]">
            <p className="text-sm">Please connect your wallet to use Sticker Creator Beta.</p>
          </div>
        )}

        {activeWalletConnected && credits !== null && typeof credits === 'number' && credits < CREDITS_PER_STICKER && (
          <div className="rounded-lg border border-[#EF4444]/50 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-4 text-[#EF4444]">
            <p className="text-sm">
              Insufficient credits. You need {CREDITS_PER_STICKER} credit{CREDITS_PER_STICKER > 1 ? 's' : ''} to generate a sticker. 
              You have {credits.toFixed(1)} credit{credits !== 1 ? 's' : ''}. Please purchase credits.
            </p>
          </div>
        )}

        <section className="grid gap-4 sm:gap-6 md:gap-8 lg:grid-cols-2">
          <div className="space-y-4 sm:space-y-6 md:space-y-8 rounded-xl border border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-4 sm:p-6 md:p-8 shadow-xl">
            <div className="space-y-3">
              <div className="block text-sm font-semibold text-white">
                Reference Image{selectedFiles.length > 1 ? 's' : ''} {selectedFiles.length > 0 && `(${selectedFiles.length})`}
              </div>
              <div className="relative flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-6 text-center">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  id="sticker-maker-file-input"
                />
                <label
                  htmlFor="sticker-maker-file-input"
                  className="relative z-20 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#00B8D4] hover:to-[#12D87A] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#00E5FF]/20 transition-all duration-200 pointer-events-none"
                >
                  {selectedFiles.length > 0 ? `Change Image${selectedFiles.length > 1 ? 's' : ''}` : "Select Image(s)"}
                </label>
                <p className="relative z-20 text-xs text-white/70 pointer-events-none">
                  Supported formats: PNG, JPG, WEBP. Max size 12MB per image.
                  {selectedFiles.length === 0 && <><br />Upload up to {MAX_IMAGES} images to combine elements in one sticker.</>}
                </p>
              </div>
            </div>

            {previewUrls.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                  Preview{selectedFiles.length > 1 ? 's' : ''}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {previewUrls.map((url, index) => (
                    <div key={index} className="relative space-y-2">
                      <div className="relative overflow-hidden rounded-lg border border-[#9945FF]/30">
                        <Image
                          src={url}
                          alt={`Selected image ${index + 1} preview`}
                          width={400}
                          height={400}
                          className="h-auto w-full object-contain"
                          unoptimized
                        />
                        <button
                          onClick={() => removeFile(index)}
                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold transition"
                          title="Remove image"
                        >
                          ×
                        </button>
                      </div>
                      <p className="text-xs text-gray-600">
                        Image {index + 1}: {selectedFiles[index]?.name} • {(((selectedFiles[index]?.size ?? 0) / 1024)).toFixed(1)} KB
                      </p>
                    </div>
                  ))}
                </div>
                {selectedFiles.length > 1 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
                    <p className="text-yellow-800 text-xs font-semibold">
                      💡 Take anything from multiple images and make it all in one image
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="sticker-maker-custom-instructions" className="block text-sm font-semibold text-gray-900">
                  Custom Instructions (Optional)
                </label>
                {customInstructions && (
                  <button
                    type="button"
                    onClick={() => setCustomInstructions("")}
                    className="text-xs font-semibold text-gray-600 hover:text-gray-900"
                  >
                    Clear
                  </button>
                )}
              </div>
              <textarea
                id="sticker-maker-custom-instructions"
                placeholder={selectedFiles.length > 1 
                  ? "Describe how you want the sticker to look. Use prompts like 'combine all elements from the images' or 'make it more colorful'."
                  : "Describe how you want the sticker to look. Examples: 'make it more colorful', 'add sparkles', 'make it cute', etc."}
                value={customInstructions}
                onChange={(event) => setCustomInstructions(event.target.value)}
                className="h-32 w-full rounded-lg border border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-3 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#9945FF]/50"
              />
              <p className="text-xs text-[#a8a8b8]/80">
                Optional: Add custom instructions to modify the sticker style or appearance.
              </p>
            </div>

            <div className="space-y-3">
              <span className="block text-sm font-semibold text-white">Background</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBackgroundMode("original")}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                    backgroundMode === "original"
                      ? "border-[#9945FF] bg-[#9945FF]/20 text-[#9945FF]"
                      : "border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white/70 hover:border-[#9945FF]/50 hover:text-white"
                  }`}
                >
                  Keep Original Background
                </button>
                <button
                  type="button"
                  onClick={() => setBackgroundMode("transparent")}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                    backgroundMode === "transparent"
                      ? "border-[#9945FF] bg-[#9945FF]/20 text-[#9945FF]"
                      : "border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white/70 hover:border-[#9945FF]/50 hover:text-white"
                  }`}
                >
                  Transparent Background
                </button>
              </div>
              <p className="text-xs text-[#a8a8b8]/80">
                Transparent mode creates a sticker with no background. Original mode preserves the full scene.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={handleProcess}
                disabled={selectedFiles.length === 0 || isProcessing || !activeWalletConnected || (credits !== null && typeof credits === 'number' && credits < CREDITS_PER_STICKER)}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#FFD60A] hover:from-[#00B8D4] hover:to-[#12D87A] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-[#00E5FF]/20 transition-all duration-200 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed disabled:text-gray-200"
              >
                {isProcessing ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                    Creating Sticker…
                  </>
                ) : (
                  <>Create Sticker ({CREDITS_PER_STICKER} credit{CREDITS_PER_STICKER > 1 ? 's' : ''})</>
                )}
              </button>
              {lastUpdated && (
                <p className="text-xs text-[#a8a8b8]/80">Last processed: {lastUpdated}</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-[#EF4444]/50 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-3 text-sm text-[#EF4444]">
                {error}
              </div>
            )}
          </div>

          <div className="space-y-4 sm:space-y-6 md:space-y-8">
            <div className="rounded-xl border border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-4 sm:p-6 md:p-8 shadow-xl">
              <div className="mb-4 sm:mb-6 flex items-center justify-between">
                <h2 className="text-base sm:text-lg md:text-xl font-semibold text-white">AI Analysis</h2>
                {result?.analysis && (
                  <button
                    onClick={() => navigator.clipboard.writeText(result.analysis)}
                    className="text-xs font-semibold text-[#9945FF] hover:text-[#14F195] transition-colors"
                  >
                    Copy Text
                  </button>
                )}
              </div>

              <textarea
                readOnly
                value={formattedAnalysis}
                placeholder="Detailed description of the uploaded image will appear here after processing."
                className="h-48 w-full resize-none rounded-lg border border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-4 font-mono text-sm leading-relaxed text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#9945FF]/50"
              />
            </div>

            <div className="rounded-xl border border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-4 sm:p-6 md:p-8 shadow-xl">
              <div className="mb-4 sm:mb-6 flex items-center justify-between">
                <h2 className="text-base sm:text-lg md:text-xl font-semibold text-white">Generation Prompt</h2>
                {result?.chromaticPrompt && (
                  <button
                    onClick={() => navigator.clipboard.writeText(result.chromaticPrompt)}
                    className="text-xs font-semibold text-[#9945FF] hover:text-[#14F195] transition-colors"
                  >
                    Copy Prompt
                  </button>
                )}
              </div>
              <textarea
                readOnly
                value={result?.chromaticPrompt ?? ""}
                placeholder="The sticker generation prompt will appear here after processing."
                className="h-48 w-full resize-none rounded-lg border border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-4 font-mono text-sm leading-relaxed text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#9945FF]/50"
              />
            </div>

            {result?.chromaticImageUrl && (
              <div className="space-y-4 sm:space-y-6 rounded-xl border border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-4 sm:p-6 md:p-8 shadow-xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-base sm:text-lg md:text-xl font-semibold text-white">Your Sticker</h2>
                  <div className="flex items-center gap-3 text-xs text-white/70">
                    <a
                      href={result.chromaticImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#9945FF] hover:text-[#14F195] transition-colors"
                    >
                      Open Full Size
                    </a>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-lg border border-[#9945FF]/30 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md">
                  <Image
                    src={result.chromaticImageUrl}
                    alt="Generated sticker"
                    width={1024}
                    height={1024}
                    className="h-auto w-full object-contain"
                    unoptimized
                  />
                </div>
                <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-3 text-xs text-[#a8a8b8]">
                  <p className="font-semibold mb-1 text-[#9945FF]">💡 Tip:</p>
                  <p>Right-click the image and select "Save image as..." to download your sticker!</p>
                </div>
              </div>
            )}
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}

