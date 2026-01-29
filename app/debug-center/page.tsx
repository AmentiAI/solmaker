'use client'

import { useState, useMemo } from 'react'
import { estimateImageGenerationCost, buildFullPrompt, formatCost } from '@/lib/cost-estimation'

interface TestResult {
  promptLength: number
  wordCount: number
  tokenEstimate: number
  cost: number
  prompt: string
  timestamp: Date
}

export default function DebugCenterPage() {
  const [shortPrompt, setShortPrompt] = useState('A mystical crystal glowing with blue energy')
  const [longPrompt, setLongPrompt] = useState('A mystical crystal glowing with blue energy, surrounded by ethereal particles and magical auras, with intricate runes carved into its surface, floating above an ancient altar in a dimly lit chamber, with dramatic lighting casting shadows across the stone floor, detailed textures showing the crystal\'s faceted surface reflecting ambient light, with mystical symbols floating around it, creating a sense of otherworldly power and ancient magic, rendered in high detail with professional lighting and atmospheric effects')
  
  const [imageSize, setImageSize] = useState<'1024x1024' | '1024x1792' | '1792x1024'>('1024x1024')
  const [quality, setQuality] = useState<'standard' | 'hd'>('hd')
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  // Calculate word count
  const getWordCount = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }

  // Build full prompts for comparison
  const shortFullPrompt = useMemo(() => {
    return buildFullPrompt(shortPrompt, 'thin decorative frame', 'professional digital illustration', 0, 1)
  }, [shortPrompt])

  const longFullPrompt = useMemo(() => {
    return buildFullPrompt(longPrompt, 'thin decorative frame', 'professional digital illustration', 0, 1)
  }, [longPrompt])

  // Calculate costs (should be the same!)
  const shortCost = useMemo(() => {
    return estimateImageGenerationCost(shortFullPrompt, 1, imageSize, quality)
  }, [shortFullPrompt, imageSize, quality])

  const longCost = useMemo(() => {
    return estimateImageGenerationCost(longFullPrompt, 1, imageSize, quality)
  }, [longFullPrompt, imageSize, quality])

  const handleTestGeneration = async (prompt: string, type: 'short' | 'long') => {
    setIsGenerating(true)
    try {
      // Simulate API call (we won't actually generate, just estimate)
      const fullPrompt = type === 'short' ? shortFullPrompt : longFullPrompt
      const cost = type === 'short' ? shortCost : longCost
      
      // Add to test results
      const result: TestResult = {
        promptLength: fullPrompt.length,
        wordCount: getWordCount(fullPrompt),
        tokenEstimate: Math.ceil(fullPrompt.length / 4),
        cost: cost.total,
        prompt: fullPrompt,
        timestamp: new Date()
      }
      
      setTestResults(prev => [result, ...prev])
      
      // Show alert with cost info
      alert(
        `${type === 'short' ? 'Short' : 'Long'} Prompt Test:\n\n` +
        `Word Count: ${result.wordCount}\n` +
        `Character Count: ${result.promptLength}\n` +
        `Estimated Tokens: ${result.tokenEstimate}\n` +
        `Cost: ${formatCost(result.cost)}\n\n` +
        `Note: OpenAI image generation charges per image, NOT per token!\n` +
        `The cost is the same regardless of prompt length.`
      )
    } catch (error) {
      console.error('Error in test generation:', error)
      alert('Error running test. Check console for details.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-purple-950">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">🔬 Debug Center</h1>
            <p className="text-gray-400 text-lg">
              Test and understand OpenAI image generation costs and prompt optimization
            </p>
          </div>

          {/* Key Insight Banner */}
          <div className="bg-blue-900/30 border-2 border-blue-600 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-blue-300 mb-3">💡 Key Insight: How OpenAI Image Generation Pricing Works</h2>
            <div className="space-y-2 text-gray-300">
              <p>
                <strong className="text-yellow-400">Important:</strong> OpenAI's image generation API (gpt-image-1, DALL-E) charges 
                <strong className="text-green-400"> per image generated</strong>, NOT per token or prompt length.
              </p>
              <p>
                The cost is determined by:
              </p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li><strong>Image Size:</strong> 1024x1024, 1024x1792, or 1792x1024</li>
                <li><strong>Quality:</strong> Standard or HD</li>
                <li><strong>Number of Images:</strong> Each image costs the same regardless of prompt complexity</li>
              </ul>
              <p className="mt-3 text-yellow-300">
                ⚠️ <strong>Prompt length does NOT affect cost!</strong> A 1000-word prompt costs the same as a 10-word prompt.
              </p>
            </div>
          </div>

          {/* Comparison Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Short Prompt */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Short Prompt (~400 words)</h2>
                <span className="px-3 py-1 bg-green-500/30 text-green-300 rounded text-sm font-semibold">
                  {getWordCount(shortFullPrompt)} words
                </span>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Base Description
                </label>
                <textarea
                  value={shortPrompt}
                  onChange={(e) => setShortPrompt(e.target.value)}
                  placeholder="Enter a short description..."
                  className="w-full h-24 p-3 border border-gray-600 rounded-lg bg-gray-900 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
                />
              </div>

              <div className="bg-gray-900 rounded-lg p-4 mb-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Full Prompt Length:</span>
                    <span className="text-white font-mono">{shortFullPrompt.length.toLocaleString()} chars</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Word Count:</span>
                    <span className="text-white font-mono">{getWordCount(shortFullPrompt).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Estimated Tokens:</span>
                    <span className="text-white font-mono">{Math.ceil(shortFullPrompt.length / 4).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-700 pt-2 mt-2">
                    <span className="text-gray-300 font-semibold">Cost per Image:</span>
                    <span className="text-green-400 font-mono font-bold text-lg">
                      {formatCost(shortCost.perImage)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleTestGeneration(shortPrompt, 'short')}
                disabled={isGenerating || !shortPrompt.trim()}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors"
              >
                {isGenerating ? 'Testing...' : 'Test Short Prompt Generation'}
              </button>
            </div>

            {/* Long Prompt */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Long Prompt (~1000 words)</h2>
                <span className="px-3 py-1 bg-orange-500/30 text-orange-300 rounded text-sm font-semibold">
                  {getWordCount(longFullPrompt)} words
                </span>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Base Description
                </label>
                <textarea
                  value={longPrompt}
                  onChange={(e) => setLongPrompt(e.target.value)}
                  placeholder="Enter a detailed, long description..."
                  className="w-full h-24 p-3 border border-gray-600 rounded-lg bg-gray-900 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
                />
              </div>

              <div className="bg-gray-900 rounded-lg p-4 mb-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Full Prompt Length:</span>
                    <span className="text-white font-mono">{longFullPrompt.length.toLocaleString()} chars</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Word Count:</span>
                    <span className="text-white font-mono">{getWordCount(longFullPrompt).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Estimated Tokens:</span>
                    <span className="text-white font-mono">{Math.ceil(longFullPrompt.length / 4).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-700 pt-2 mt-2">
                    <span className="text-gray-300 font-semibold">Cost per Image:</span>
                    <span className="text-green-400 font-mono font-bold text-lg">
                      {formatCost(longCost.perImage)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleTestGeneration(longPrompt, 'long')}
                disabled={isGenerating || !longPrompt.trim()}
                className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors"
              >
                {isGenerating ? 'Testing...' : 'Test Long Prompt Generation'}
              </button>
            </div>
          </div>

          {/* Cost Comparison */}
          <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-2 border-purple-600 rounded-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">💰 Cost Comparison</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-black/40 rounded-lg p-4 border border-gray-700">
                <p className="text-gray-400 text-sm mb-2">Short Prompt Cost</p>
                <p className="text-3xl font-bold text-green-400">{formatCost(shortCost.perImage)}</p>
                <p className="text-xs text-gray-500 mt-1">{getWordCount(shortFullPrompt)} words</p>
              </div>
              <div className="bg-black/40 rounded-lg p-4 border border-gray-700">
                <p className="text-gray-400 text-sm mb-2">Long Prompt Cost</p>
                <p className="text-3xl font-bold text-green-400">{formatCost(longCost.perImage)}</p>
                <p className="text-xs text-gray-500 mt-1">{getWordCount(longFullPrompt)} words</p>
              </div>
              <div className="bg-black/40 rounded-lg p-4 border-2 border-yellow-600">
                <p className="text-gray-400 text-sm mb-2">Cost Difference</p>
                <p className="text-3xl font-bold text-yellow-400">
                  {formatCost(Math.abs(shortCost.perImage - longCost.perImage))}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {shortCost.perImage === longCost.perImage ? 'Same cost!' : 'Different'}
                </p>
              </div>
            </div>
            <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
              <p className="text-yellow-300 text-sm">
                ✅ <strong>Result:</strong> Both prompts cost the same because OpenAI charges per image, not per token or prompt length.
                The cost is determined by image size ({imageSize}) and quality ({quality.toUpperCase()}) only.
              </p>
            </div>
          </div>

          {/* Settings */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">⚙️ Test Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Image Size
                </label>
                <select
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value as '1024x1024' | '1024x1792' | '1792x1024')}
                  className="w-full p-3 border border-gray-600 rounded-lg bg-gray-900 text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="1024x1024">1024x1024 (Square) - $0.040/$0.080</option>
                  <option value="1024x1792">1024x1792 (Portrait) - $0.080/$0.120</option>
                  <option value="1792x1024">1792x1024 (Landscape) - $0.080/$0.120</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Quality
                </label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as 'standard' | 'hd')}
                  className="w-full p-3 border border-gray-600 rounded-lg bg-gray-900 text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="standard">Standard - Lower cost</option>
                  <option value="hd">HD - Higher quality, higher cost</option>
                </select>
              </div>
            </div>
          </div>

          {/* Optimization Insights */}
          <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border-2 border-green-600 rounded-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">🎯 Optimization Insights</h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-lg font-semibold text-green-400 mb-2">What DOES Affect Cost:</h3>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li><strong>Image Size:</strong> Larger images (1024x1792, 1792x1024) cost more than square (1024x1024)</li>
                  <li><strong>Quality:</strong> HD quality costs 2x more than Standard</li>
                  <li><strong>Number of Images:</strong> Each image costs the same, so batch generation = cost × count</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-400 mb-2">What DOES NOT Affect Cost:</h3>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li><strong>Prompt Length:</strong> 10 words or 1000 words - same cost</li>
                  <li><strong>Token Count:</strong> Not used for pricing in image generation</li>
                  <li><strong>Prompt Complexity:</strong> Simple or detailed prompts cost the same</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">Optimization Strategy:</h3>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>Use detailed prompts freely - they don't increase costs</li>
                  <li>Optimize by choosing the right image size for your use case</li>
                  <li>Use Standard quality if HD isn't necessary to save 50%</li>
                  <li>Batch generation is cost-effective - each image costs the same</li>
                  <li>Focus on prompt quality for better results, not cost savings</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Test Results History */}
          {testResults.length > 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">📊 Test Results History</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {testResults.map((result, index) => (
                  <div key={index} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm text-gray-400">
                          Test #{testResults.length - index} • {result.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-400">{formatCost(result.cost)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                      <div>
                        <span className="text-gray-400">Words:</span>
                        <span className="text-white ml-2 font-mono">{result.wordCount.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Chars:</span>
                        <span className="text-white ml-2 font-mono">{result.promptLength.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Tokens:</span>
                        <span className="text-white ml-2 font-mono">{result.tokenEstimate.toLocaleString()}</span>
                      </div>
                    </div>
                    <details className="mt-2">
                      <summary className="text-sm text-blue-400 cursor-pointer hover:text-blue-300">
                        View Full Prompt
                      </summary>
                      <pre className="mt-2 text-xs text-gray-400 bg-black/50 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                        {result.prompt}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full Explanation */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mt-8">
            <h2 className="text-2xl font-bold text-white mb-4">📚 Complete Explanation</h2>
            <div className="prose prose-invert max-w-none space-y-4 text-gray-300">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">How OpenAI Image Generation Pricing Works</h3>
                <p>
                  Unlike text generation models (GPT-4, etc.) that charge per token, OpenAI's image generation models 
                  (gpt-image-1, DALL-E 2, DALL-E 3) use a <strong>per-image pricing model</strong>. This means:
                </p>
                <ul className="list-disc list-inside ml-4 space-y-1 mt-2">
                  <li>Each image costs a fixed amount based on size and quality</li>
                  <li>Prompt length, complexity, or token count does NOT affect the price</li>
                  <li>A 10-word prompt costs the same as a 1000-word prompt</li>
                  <li>You can use as much detail in your prompts as needed without worrying about cost</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Current Pricing (as of 2024)</h3>
                <div className="bg-gray-900 rounded-lg p-4 mt-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-2 text-gray-300">Size</th>
                        <th className="text-right py-2 text-gray-300">Standard</th>
                        <th className="text-right py-2 text-gray-300">HD</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 text-gray-400">1024×1024</td>
                        <td className="text-right py-2 text-white font-mono">$0.040</td>
                        <td className="text-right py-2 text-white font-mono">$0.080</td>
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 text-gray-400">1024×1792</td>
                        <td className="text-right py-2 text-white font-mono">$0.080</td>
                        <td className="text-right py-2 text-white font-mono">$0.120</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-gray-400">1792×1024</td>
                        <td className="text-right py-2 text-white font-mono">$0.080</td>
                        <td className="text-right py-2 text-white font-mono">$0.120</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Why This Matters for Your App</h3>
                <p>
                  Since prompt length doesn't affect cost, you can:
                </p>
                <ul className="list-disc list-inside ml-4 space-y-1 mt-2">
                  <li>Generate detailed, comprehensive prompts for better image quality</li>
                  <li>Include all necessary style, lighting, and detail instructions</li>
                  <li>Add variation instructions for batch generation</li>
                  <li>Focus on prompt quality rather than brevity</li>
                </ul>
                <p className="mt-2">
                  <strong>Optimization focus should be on:</strong> Choosing the right image size and quality level 
                  for your use case, not on shortening prompts.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
                          
