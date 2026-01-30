"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useWallet } from '@/lib/wallet/compatibility'
import { isAuthorized } from '@/lib/auth/access-control'

interface ProcessResult {
  analysis: string
  chromaticPrompt: string
  chromaticImageUrl: string
  originalUploadUrl?: string
  instructions?: string
  backgroundMode?: "original" | "transparent"
}

interface Collection {
  id: string
  name: string
  description?: string
  is_active: boolean
}

export default function Tester11Page() {
  const { isConnected, currentAddress } = useWallet()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [customInstructions, setCustomInstructions] = useState("")
  const [backgroundMode, setBackgroundMode] = useState<"original" | "transparent">("original")
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const authorized = isAuthorized(currentAddress)

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

  useEffect(() => {
    const loadCollections = async () => {
      try {
        const response = await fetch('/api/collections')
        if (response.ok) {
          const data = await response.json()
          setCollections(data.collections || [])
          // Auto-select active collection if available
          const active = data.collections?.find((c: Collection) => c.is_active)
          if (active) {
            setSelectedCollectionId(active.id)
          }
        }
      } catch (error) {
        console.error('Error loading collections:', error)
      }
    }
    loadCollections()
  }, [])

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
    console.log('[Tester11] Files selected:', files.length)
    
    if (files.length === 0) {
      console.log('[Tester11] No files selected')
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
    console.log('[Tester11] Files set successfully:', validFiles.length)
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setResult(null)
  }

  const handleProcess = async () => {
    if (selectedFiles.length === 0) {
      setError("Please select at least one image to analyze.")
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
      if (currentAddress) {
        formData.append("wallet_address", currentAddress)
      }

      let response: Response
      try {
        response = await fetch("/api/tester11", {
          method: "POST",
          body: formData,
        })
      } catch (fetchError) {
        // Network error - fetch failed before getting a response
        console.error("[tester11] Network error:", fetchError)
        if (fetchError instanceof TypeError && fetchError.message === "Failed to fetch") {
          throw new Error(
            "Unable to connect to the server. Please check that the development server is running and try again."
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
          // If response isn't JSON, try to get text
          try {
            const text = await response.text()
            errorData = { error: text || `Server error (status ${response.status})` }
          } catch {
            errorData = { error: `Server error (status ${response.status})` }
          }
        }
        
        const errorMessage = errorData?.error || errorData?.details || `Failed to process image (status ${response.status})`
        const errorCode = errorData?.code || ''
        
        // Show user-friendly message for moderation errors
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
    } catch (processError) {
      console.error("[tester11] process error:", processError)
      setError(
        processError instanceof Error
          ? processError.message
          : "Failed to process the image. Please try again.",
      )
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSaveToCollection = async () => {
    if (!result?.chromaticImageUrl || !selectedCollectionId) {
      setError("Please select a collection and ensure an image has been generated.")
      return
    }

    setIsSaving(true)
    setSaveMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/tester11/save-to-collection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collectionId: selectedCollectionId,
          imageUrl: result.chromaticImageUrl,
          prompt: result.chromaticPrompt,
          analysis: result.analysis,
          instructions: customInstructions,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData?.error || 'Failed to save image to collection')
      }

      const data = await response.json()
      setSaveMessage(`✅ Image saved to collection successfully!`)
      setTimeout(() => setSaveMessage(null), 5000)
    } catch (saveError) {
      console.error('[Tester11] Save error:', saveError)
      setError(saveError instanceof Error ? saveError.message : 'Failed to save image to collection')
    } finally {
      setIsSaving(false)
    }
  }

  // Access control check
  if (!isConnected || !authorized) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md mx-auto px-6">
          <h1 className="text-3xl font-bold text-[#EF4444]">Access Restricted</h1>
          <p className="text-slate-300">
            This feature is only available to authorized users.
          </p>
          {!isConnected && (
            <p className="text-slate-400 text-sm">Please connect your wallet to continue.</p>
          )}
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
        <header className="space-y-4">
          <h1 className="text-3xl font-bold text-slate-50">Image Recreator (Tester11)</h1>
          <p className="max-w-3xl text-sm text-slate-300">
            Upload one or more reference images and the AI will first produce hyper-detailed descriptions.
            It then recreates the image(s) according to your instructions while honoring the original
            composition, posing, and camera placement. Upload multiple character images to combine them all in one image!
          </p>
        </header>

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6 rounded-xl border border-slate-800 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/40 p-6 shadow-xl">
            <div className="space-y-3">
              <div className="block text-sm font-semibold text-slate-200">
                Reference Image{selectedFiles.length > 1 ? 's' : ''} {selectedFiles.length > 0 && `(${selectedFiles.length})`}
              </div>
              <div className="relative flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-slate-700 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/60 p-6 text-center">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  id="tester11-file-input"
                />
                <label
                  htmlFor="tester11-file-input"
                  className="relative z-20 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-50 shadow-lg shadow-slate-900/40 transition hover:border-slate-400 hover:bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 pointer-events-none"
                >
                  {selectedFiles.length > 0 ? `Change Image${selectedFiles.length > 1 ? 's' : ''}` : "Select Image(s)"}
                </label>
                <p className="relative z-20 text-xs text-slate-400 pointer-events-none">
                  Supported formats: PNG, JPG, WEBP. Max size 12MB per image.
                  {selectedFiles.length === 0 && <><br />Upload multiple images to combine characters in one image.</>}
                </p>
              </div>
            </div>

            {previewUrls.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Preview{selectedFiles.length > 1 ? 's' : ''}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {previewUrls.map((url, index) => (
                    <div key={index} className="relative space-y-2">
                      <div className="relative overflow-hidden rounded-lg border border-slate-800">
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
                          className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold transition"
                          title="Remove image"
                        >
                          ×
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">
                        Image {index + 1}: {selectedFiles[index]?.name} • {(((selectedFiles[index]?.size ?? 0) / 1024)).toFixed(1)} KB
                      </p>
                    </div>
                  ))}
                </div>
                {selectedFiles.length > 1 && (
                  <div className="bg-yellow-900/30 border border-[#FBBF24]/20/50 rounded p-2 mt-2">
                    <p className="text-yellow-300 text-xs font-semibold">
                      💡 Multi-character mode: All characters will be combined into one image. Use prompts like "remake all characters" or "combine all characters".
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="tester11-custom-instructions" className="block text-sm font-semibold text-slate-200">
                  Desired Adjustments
                </label>
                {customInstructions && (
                  <button
                    type="button"
                    onClick={() => setCustomInstructions("")}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-200"
                  >
                    Clear
                  </button>
                )}
              </div>
              <textarea
                id="tester11-custom-instructions"
                placeholder={selectedFiles.length > 1 
                  ? "Describe how you want the new image to change. For multiple characters, use prompts like 'remake all characters from all images in one image' or 'combine all characters with the style of image 1'."
                  : "Describe how you want the new image to change or evolve from the original while staying true to the base composition."}
                value={customInstructions}
                onChange={(event) => setCustomInstructions(event.target.value)}
                className="h-40 w-full rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <p className="text-xs text-slate-400">
                {selectedFiles.length > 1 
                  ? "The AI will analyze each image separately, then combine all characters into one image based on your instructions."
                  : "The AI will describe your image first, then blend your instructions into the remake prompt for precise control."}
              </p>
            </div>

            <div className="space-y-3">
              <span className="block text-sm font-semibold text-slate-200">Background</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBackgroundMode("original")}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                    backgroundMode === "original"
                      ? "border-emerald-400 bg-[#14F195]/20 text-emerald-200"
                      : "border-slate-700 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/60 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  Keep Original Background
                </button>
                <button
                  type="button"
                  onClick={() => setBackgroundMode("transparent")}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                    backgroundMode === "transparent"
                      ? "border-sky-400 bg-sky-500/20 text-sky-200"
                      : "border-slate-700 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/60 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  Transparent Background
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Transparent mode removes the environment while keeping silhouettes identical. Original mode preserves the full scene.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={handleProcess}
                disabled={selectedFiles.length === 0 || isProcessing}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-950 disabled:text-slate-500"
              >
                {isProcessing ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                    Processing…
                  </>
                ) : (
                  <>Analyze &amp; Generate</>
                )}
              </button>
              {lastUpdated && (
                <p className="text-xs text-slate-500">Last processed: {lastUpdated}</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/40 p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">AI Analysis</h2>
                {result?.analysis && (
                  <button
                    onClick={() => navigator.clipboard.writeText(result.analysis)}
                    className="text-xs font-semibold text-indigo-300 hover:text-indigo-200"
                  >
                    Copy Text
                  </button>
                )}
              </div>

              <textarea
                readOnly
                value={formattedAnalysis}
                placeholder="Detailed description of the uploaded image will appear here after processing."
                className="h-32 w-full resize-none rounded-lg border border-slate-800 bg-slate-950/50 p-3 font-mono text-[10px] leading-tight text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
              />
            </div>

            <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/40 p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Generation Prompt</h2>
                {result?.chromaticPrompt && (
                  <button
                    onClick={() => navigator.clipboard.writeText(result.chromaticPrompt)}
                    className="text-xs font-semibold text-indigo-300 hover:text-indigo-200"
                  >
                    Copy Prompt
                  </button>
                )}
              </div>
              <textarea
                readOnly
                value={result?.chromaticPrompt ?? ""}
                placeholder="The remake prompt will appear here after processing."
                className="h-32 w-full resize-none rounded-lg border border-slate-800 bg-slate-950/50 p-3 font-mono text-[10px] leading-tight text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
              />
            </div>

            {result?.chromaticImageUrl && (
              <div className="space-y-3 rounded-xl border border-slate-800 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/40 p-6 shadow-xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-100">Recreated Image</h2>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <a
                      href={result.chromaticImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-indigo-300 hover:text-indigo-200"
                    >
                      Open Full Size
                    </a>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-lg border border-slate-800">
                  <Image
                    src={result.chromaticImageUrl}
                    alt="AI recreation"
                    width={1024}
                    height={1024}
                    className="h-auto w-full object-contain"
                    unoptimized
                  />
                </div>
                
                {/* Save to Collection Section */}
                <div className="mt-4 space-y-3 rounded-lg border border-slate-700 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/40 p-4">
                  <h3 className="text-sm font-semibold text-slate-200">Save to Collection</h3>
                  <div className="space-y-2">
                    <select
                      value={selectedCollectionId}
                      onChange={(e) => setSelectedCollectionId(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/60 p-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">Select a collection...</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.name} {collection.is_active && '(Active)'}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleSaveToCollection}
                      disabled={!selectedCollectionId || isSaving}
                      className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {isSaving ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                          Saving...
                        </span>
                      ) : (
                        '💾 Save to Collection'
                      )}
                    </button>
                    {saveMessage && (
                      <div className="rounded-lg border border-[#14F195]/30 bg-emerald-500/10 p-2 text-xs text-[#14F195]">
                        {saveMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

