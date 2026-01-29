'use client'

import { useState, useMemo } from 'react'
import { estimateImageGenerationCost, buildFullPrompt, formatCost } from '@/lib/cost-estimation'

export default function PromptEstimatorPage() {
  const [description, setDescription] = useState('')
  const [borderStyle, setBorderStyle] = useState('thin decorative frame with intricate corner ornaments')
  const [artStyle, setArtStyle] = useState('professional digital illustration, cute cartoonish style')
  const [batchCount, setBatchCount] = useState(1)
  const [imageSize, setImageSize] = useState<'1024x1024' | '1024x1792' | '1792x1024'>('1024x1024')
  const [quality, setQuality] = useState<'standard' | 'hd'>('hd')

  // Calculate cost estimation
  const costEstimation = useMemo(() => {
    if (!description.trim()) return null
    const fullPrompt = buildFullPrompt(description, borderStyle, artStyle, 0, batchCount)
    return estimateImageGenerationCost(fullPrompt, batchCount, imageSize, quality)
  }, [description, borderStyle, artStyle, batchCount, imageSize, quality])

  const borderOptions = [
    'thin decorative frame with intricate corner ornaments',
    'ornate gothic frame with intricate skull decorations and bone filigree',
    'spooky frame with detailed spider webs stretching across corners',
    'haunted frame with twisted thorny vines and floral corner ornaments',
    'dark frame with bat silhouettes and gothic arch carvings',
    'eerie frame with dripping wax effects and melting ornamental corners',
    'occult frame with mystical symbols and pentagram corner elements',
    'graveyard frame with tombstone shapes and iron gate corner details',
    'witchy frame with potion bottles and cauldron corner decorations',
    'skeletal frame with ribcage patterns and skull corner ornaments',
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-purple-950">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">💰 Prompt Cost Estimator</h1>
            <p className="text-gray-400">
              Estimate the cost of generating images with OpenAI's gpt-image-1 model
            </p>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Input Form */}
            <div className="space-y-4">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">Prompt Settings</h2>

                {/* Image Description */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Image Description *
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what you want to generate... (e.g., 'A mystical crystal glowing with blue energy', 'A medieval sword with ornate handle', etc.)"
                    className="w-full h-32 p-3 border border-gray-600 rounded-lg bg-gray-900 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
                  />
                </div>

                {/* Art Style */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Art Style
                  </label>
                  <input
                    type="text"
                    value={artStyle}
                    onChange={(e) => setArtStyle(e.target.value)}
                    placeholder="Professional digital illustration style..."
                    className="w-full p-3 border border-gray-600 rounded-lg bg-gray-900 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                {/* Border Style */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Border Style
                  </label>
                  <select
                    value={borderStyle}
                    onChange={(e) => setBorderStyle(e.target.value)}
                    className="w-full p-3 border border-gray-600 rounded-lg bg-gray-900 text-white focus:border-purple-500 focus:outline-none"
                  >
                    {borderOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Batch Count */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Generate Count (1-100)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={batchCount}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(100, parseInt(e.target.value) || 1))
                      setBatchCount(val)
                    }}
                    className="w-full p-3 border border-gray-600 rounded-lg bg-gray-900 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                {/* Image Size */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Image Size
                  </label>
                  <select
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value as '1024x1024' | '1024x1792' | '1792x1024')}
                    className="w-full p-3 border border-gray-600 rounded-lg bg-gray-900 text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="1024x1024">1024x1024 (Square)</option>
                    <option value="1024x1792">1024x1792 (Portrait)</option>
                    <option value="1792x1024">1792x1024 (Landscape)</option>
                  </select>
                </div>

                {/* Quality */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Quality
                  </label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as 'standard' | 'hd')}
                    className="w-full p-3 border border-gray-600 rounded-lg bg-gray-900 text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="standard">Standard</option>
                    <option value="hd">HD</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Right: Cost Estimation Display */}
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/40 border-2 border-blue-700 rounded-lg p-6 sticky top-4">
                <h2 className="text-xl font-bold text-blue-300 mb-4 flex items-center gap-2">
                  <span>💰</span>
                  Cost Estimation
                </h2>

                {!description.trim() ? (
                  <div className="text-center py-8 text-gray-400">
                    <p>Enter a description above to see cost estimation</p>
                  </div>
                ) : costEstimation ? (
                  <div className="space-y-4">
                    {/* Per Image Cost */}
                    <div className="bg-black/30 rounded-lg p-4 border border-blue-600/30">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-300">Per Image:</span>
                        <span className="text-white font-mono font-bold text-xl">
                          {formatCost(costEstimation.perImage)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {costEstimation.size} • {costEstimation.quality.toUpperCase()} Quality
                      </p>
                    </div>

                    {/* Total Cost */}
                    <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 rounded-lg p-4 border-2 border-green-600">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-300 font-semibold">Total Cost:</span>
                        <span className="text-green-400 font-mono font-bold text-3xl">
                          {formatCost(costEstimation.total)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        For {batchCount} image{batchCount > 1 ? 's' : ''}
                      </p>
                    </div>

                    {/* Prompt Details */}
                    <div className="bg-black/30 rounded-lg p-4 border border-gray-700">
                      <h3 className="text-sm font-semibold text-gray-300 mb-3">Prompt Details</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Estimated Tokens:</span>
                          <span className="text-white font-mono">{costEstimation.estimatedTokens.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Model:</span>
                          <span className="text-white">gpt-image-1</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Size:</span>
                          <span className="text-white">{costEstimation.size}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Quality:</span>
                          <span className="text-white">{costEstimation.quality.toUpperCase()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Full Prompt Preview */}
                    <div className="bg-black/30 rounded-lg p-4 border border-gray-700">
                      <h3 className="text-sm font-semibold text-gray-300 mb-2">Full Prompt Preview</h3>
                      <div className="bg-gray-900 rounded p-3 max-h-48 overflow-y-auto">
                        <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono">
                          {buildFullPrompt(description, borderStyle, artStyle, 0, batchCount)}
                        </pre>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Character count: {buildFullPrompt(description, borderStyle, artStyle, 0, batchCount).length.toLocaleString()}
                      </p>
                    </div>

                    {/* Pricing Info */}
                    <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
                      <p className="text-xs text-yellow-300">
                        💡 <strong>Note:</strong> Pricing is based on OpenAI's current rates. Actual costs may vary.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Footer Info */}
          <div className="mt-8 bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">About Cost Estimation</h3>
            <div className="space-y-2 text-sm text-gray-300">
              <p>
                • <strong>Per Image Pricing:</strong> Costs are calculated per image generated, not per token.
              </p>
              <p>
                • <strong>Token Estimation:</strong> Token count is estimated for reference only (~4 characters per token).
              </p>
              <p>
                • <strong>Quality Levels:</strong> HD quality costs more than Standard quality.
              </p>
              <p>
                • <strong>Size Options:</strong> Different image sizes have different pricing tiers.
              </p>
              <p>
                • <strong>Batch Generation:</strong> Total cost = Per Image Cost × Number of Images
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

