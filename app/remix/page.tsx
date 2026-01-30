'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface UploadedImage {
  id: string
  file: File
  preview: string
  name: string
}

interface GeneratedImage {
  id: string
  imageUrl: string
  prompt: string
  createdAt: string
}

export default function RemixPage() {
  const [images, setImages] = useState<UploadedImage[]>([])
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newImages = files.map((file) => ({
      id: `img-${Date.now()}-${Math.random()}`,
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
    }))
    setImages((prev) => [...prev, ...newImages])
  }

  const removeImage = (id: string) => {
    setImages((prev) => {
      const image = prev.find((img) => img.id === id)
      if (image) {
        URL.revokeObjectURL(image.preview)
      }
      return prev.filter((img) => img.id !== id)
    })
  }

  const handleGenerate = async () => {
    if (images.length === 0) {
      setError('Please upload at least one image')
      return
    }

    if (!prompt.trim()) {
      setError('Please enter a prompt describing what you want')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      // Convert images to base64
      const imagePromises = images.map((img) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            resolve(result)
          }
          reader.onerror = reject
          reader.readAsDataURL(img.file)
        })
      })

      const imageDataUrls = await Promise.all(imagePromises)

      const response = await fetch('/api/remix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images: imageDataUrls,
          prompt: prompt.trim(),
          imageNames: images.map((img) => img.name),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to generate' }))
        throw new Error(errorData.error || 'Failed to generate image')
      }

      const data = await response.json()

      const newGeneratedImage: GeneratedImage = {
        id: `gen-${Date.now()}`,
        imageUrl: data.imageUrl,
        prompt: prompt.trim(),
        createdAt: new Date().toISOString(),
      }

      setGeneratedImages((prev) => [newGeneratedImage, ...prev])
      setPrompt('') // Clear prompt after successful generation
    } catch (err) {
      console.error('Generation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate image')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDelete = (id: string) => {
    setGeneratedImages((prev) => prev.filter((img) => img.id !== id))
  }

  const handleDownload = async (imageUrl: string, index: number) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `remix-${index}-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading image:', error)
      setError('Failed to download image')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-black to-purple-950">
      {/* Header */}
      <header className="border-b border-indigo-900/50 bg-black/40 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-indigo-400">🎨 Image Remix Studio</h1>
            <Link
              href="/"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Instructions */}
          <div className="mb-8 bg-gradient-to-br from-indigo-900/50 to-purple-900/50 border border-indigo-700/50 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">How to Use</h2>
            <div className="space-y-3 text-white text-sm">
              <p>1. Upload one or more reference images</p>
              <p>2. Write a prompt describing what you want to change (e.g., "Use the style of image 2 but keep everything else from image 1")</p>
              <p>3. The AI will analyze your images and create a new image based on your prompt</p>
              
              <div className="bg-yellow-900/30 border border-[#FBBF24]/20/50 rounded p-3 mt-4">
                <p className="text-yellow-300 font-semibold mb-2">⚠️ STRICT RULES:</p>
                <p className="text-yellow-200 text-xs">
                  The AI will ONLY change what you explicitly mention. Everything else stays EXACTLY the same. 
                  Be specific about what to change (style, colors, etc.) and what to keep.
                </p>
              </div>

              <p className="text-indigo-300 font-semibold mt-4">
                Example prompts:
              </p>
              <ul className="list-disc list-inside ml-4 space-y-1 text-xs">
                <li>"Use the art style of image 2 but keep the character and background from image 1 exactly the same"</li>
                <li>"Change only the colors to match image 2, keep everything else from image 1"</li>
                <li>"Make image 1 look like image 2's style but keep all characters, background, and composition from image 1"</li>
                <li>"Use the lighting from image 2 but preserve everything else from image 1"</li>
                <li className="text-yellow-300 font-semibold mt-2">Multi-character examples:</li>
                <li>"Remake all characters from all images in one image using the style of image 1"</li>
                <li>"Combine all characters into one image, each remade with the art style of image 2"</li>
                <li>"Include all characters from all images, each transformed with the colors from image 1"</li>
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Image Upload and Prompt */}
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-4">Upload Images</h2>
                
                {/* Image Upload */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-white mb-2">
                    Select Images (you can select multiple)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="w-full p-3 border border-[#9945FF]/30 rounded-lg bg-[#14141e] text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
                  />
                </div>

                {/* Uploaded Images Preview */}
                {images.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-white mb-2">
                      Uploaded Images ({images.length})
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {images.map((img, index) => (
                        <div key={img.id} className="relative group">
                          <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-[#9945FF]/20">
                            <Image
                              src={img.preview}
                              alt={img.name}
                              fill
                              className="object-cover"
                            />
                          </div>
                          <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            Image {index + 1}
                          </div>
                          <button
                            onClick={() => removeImage(img.id)}
                            className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Prompt Input */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Transformation Prompt *
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder='Example: "Use the art style of image 2 but keep the character, background, and all elements from image 1 exactly the same"'
                    className="w-full h-32 p-3 border border-[#9945FF]/30 rounded-lg bg-[#14141e] text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
                    disabled={isGenerating}
                  />
                  <p className="text-xs text-[#a8a8b8]/80 mt-2">
                    Describe what you want. Reference images by number (e.g., "image 1", "image 2")
                  </p>
                </div>

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || images.length === 0 || !prompt.trim()}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {isGenerating ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generating...
                    </span>
                  ) : (
                    '✨ Generate Remix'
                  )}
                </button>

                {error && (
                  <div className="bg-red-900/50 border border-[#EF4444]/20 text-red-200 px-4 py-3 rounded-lg mt-4">
                    {error}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Generated Images */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">
                  Generated Images ({generatedImages.length})
                </h2>
                {generatedImages.length > 0 && (
                  <button
                    onClick={() => setGeneratedImages([])}
                    className="text-sm text-[#a8a8b8] hover:text-white"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {generatedImages.length > 0 ? (
                <div className="space-y-6">
                  {generatedImages.map((image, index) => (
                    <div
                      key={image.id}
                      className="bg-[#1a1a24] border border-[#9945FF]/20 rounded-lg overflow-hidden shadow-lg"
                    >
                      <div className="relative aspect-square">
                        <Image
                          src={image.imageUrl}
                          alt={`Generated ${index + 1}`}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="p-4">
                        <p className="text-xs text-[#a8a8b8]/80 mb-2">
                          {new Date(image.createdAt).toLocaleString()}
                        </p>
                        <p className="text-sm text-white mb-4 line-clamp-2">
                          {image.prompt}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleDownload(image.imageUrl, index)}
                            className="text-sm bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white py-2 px-3 rounded transition-colors flex items-center justify-center gap-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download
                          </button>
                          <button
                            onClick={() => handleDelete(image.id)}
                            className="text-sm bg-red-600 hover:bg-red-700 text-white py-2 px-3 rounded transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 bg-[#1a1a24] border border-[#9945FF]/20 rounded-lg">
                  <div className="text-6xl mb-4">🎨</div>
                  <p className="text-xl text-[#a8a8b8] mb-2">No images generated yet</p>
                  <p className="text-[#a8a8b8]/80">Upload images and write a prompt to get started!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

