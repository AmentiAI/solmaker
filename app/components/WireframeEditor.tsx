'use client'

import { useState, useEffect } from 'react'

export interface WireframePoint {
  id: string
  label: string
  x: number
  y: number
  locked?: boolean
}

export interface WireframeConfig {
  points: WireframePoint[]
  headWidth?: number
  headHeight?: number
  preset?: string
}

interface WireframeEditorProps {
  config: WireframeConfig | null
  onChange: (config: WireframeConfig) => void
  bodyStyle: 'headonly' | 'half' | 'full'
}

// Preset configurations with descriptive names
export const POSITION_PRESETS = [
  {
    id: 'centered-standard',
    name: 'Centered Standard',
    description: 'Classic centered portrait, balanced composition',
    headTopY: 10,
    eyeLineY: 32,
    noseY: 44,
    mouthY: 51,
    shoulderY: 67,
    bottomY: 77,
    headWidth: 40,
    headHeight: 60,
    shoulderLeftX: 30,
    shoulderRightX: 70,
  },
  {
    id: 'centered-large',
    name: 'Centered Large Head',
    description: 'Bigger head, closer to camera',
    headTopY: 8,
    eyeLineY: 28,
    noseY: 38,
    mouthY: 44,
    shoulderY: 62,
    bottomY: 72,
    headWidth: 50,
    headHeight: 65,
    shoulderLeftX: 25,
    shoulderRightX: 75,
  },
  {
    id: 'centered-small',
    name: 'Centered Small Head',
    description: 'Smaller head, more body visible',
    headTopY: 12,
    eyeLineY: 36,
    noseY: 48,
    mouthY: 56,
    shoulderY: 72,
    bottomY: 82,
    headWidth: 35,
    headHeight: 55,
    shoulderLeftX: 32,
    shoulderRightX: 68,
  },
  {
    id: 'high-position',
    name: 'High Position',
    description: 'Character positioned higher in frame',
    headTopY: 5,
    eyeLineY: 25,
    noseY: 35,
    mouthY: 42,
    shoulderY: 60,
    bottomY: 70,
    headWidth: 42,
    headHeight: 62,
    shoulderLeftX: 28,
    shoulderRightX: 72,
  },
  {
    id: 'low-position',
    name: 'Low Position',
    description: 'Character positioned lower in frame',
    headTopY: 15,
    eyeLineY: 38,
    noseY: 50,
    mouthY: 58,
    shoulderY: 74,
    bottomY: 84,
    headWidth: 38,
    headHeight: 58,
    shoulderLeftX: 32,
    shoulderRightX: 68,
  },
  {
    id: 'wide-shoulders',
    name: 'Wide Shoulders',
    description: 'Broader shoulder frame',
    headTopY: 10,
    eyeLineY: 32,
    noseY: 44,
    mouthY: 51,
    shoulderY: 67,
    bottomY: 77,
    headWidth: 40,
    headHeight: 60,
    shoulderLeftX: 20,
    shoulderRightX: 80,
  },
  {
    id: 'narrow-shoulders',
    name: 'Narrow Shoulders',
    description: 'Narrower shoulder frame',
    headTopY: 10,
    eyeLineY: 32,
    noseY: 44,
    mouthY: 51,
    shoulderY: 67,
    bottomY: 77,
    headWidth: 40,
    headHeight: 60,
    shoulderLeftX: 35,
    shoulderRightX: 65,
  },
]

const HEAD_SIZE_PRESETS = [
  { id: 'small', name: 'Small Head', width: 32, height: 52 },
  { id: 'medium', name: 'Medium Head', width: 40, height: 60 },
  { id: 'large', name: 'Large Head', width: 48, height: 68 },
  { id: 'xlarge', name: 'Extra Large Head', width: 55, height: 72 },
]

export default function WireframeEditor({ config, onChange, bodyStyle }: WireframeEditorProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>(
    config?.preset || 'centered-standard'
  )
  const [headSizePreset, setHeadSizePreset] = useState<string>('medium')
  const [previewImages, setPreviewImages] = useState<Record<string, string>>({})
  const [generatingPreview, setGeneratingPreview] = useState<string | null>(null)

  // Convert preset to wireframe config
  const presetToConfig = (presetId: string, headSizeId: string): WireframeConfig => {
    const positionPreset = POSITION_PRESETS.find(p => p.id === presetId) || POSITION_PRESETS[0]
    const sizePreset = HEAD_SIZE_PRESETS.find(s => s.id === headSizeId) || HEAD_SIZE_PRESETS[1]
    
    return {
      preset: presetId,
      headWidth: sizePreset.width,
      headHeight: sizePreset.height,
      points: [
        { id: 'head-top', label: 'Top of Head', x: 50, y: positionPreset.headTopY, locked: false },
        { id: 'eye-line', label: 'Eye Line', x: 50, y: positionPreset.eyeLineY, locked: false },
        { id: 'nose-tip', label: 'Nose Tip', x: 50, y: positionPreset.noseY, locked: false },
        { id: 'mouth-center', label: 'Mouth Center', x: 50, y: positionPreset.mouthY, locked: false },
        { id: 'shoulder-left', label: 'Left Shoulder', x: positionPreset.shoulderLeftX, y: positionPreset.shoulderY, locked: false },
        { id: 'shoulder-right', label: 'Right Shoulder', x: positionPreset.shoulderRightX, y: positionPreset.shoulderY, locked: false },
        { id: 'shoulder-center', label: 'Shoulder Line', x: 50, y: positionPreset.shoulderY, locked: true },
        { id: 'bottom-crop', label: 'Bottom Crop', x: 50, y: positionPreset.bottomY, locked: false },
      ],
    }
  }

  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Load existing previews from database on mount
  useEffect(() => {
    const loadExistingPreviews = async () => {
      try {
        const response = await fetch('/api/collections/position-preview')
        if (response.ok) {
          const data = await response.json()
          if (data.previews && typeof data.previews === 'object') {
            setPreviewImages(data.previews)
            console.log(`[WireframeEditor] Loaded ${Object.keys(data.previews).length} cached previews`)
          }
        }
      } catch (error) {
        console.error('[WireframeEditor] Failed to load existing previews:', error)
      }
    }

    loadExistingPreviews()
  }, [])

  // Load config on mount
  useEffect(() => {
    if (config && isInitialLoad) {
      if (config.preset) {
        setSelectedPreset(config.preset)
      }
      // Determine head size preset from config
      const headWidth = config.headWidth || 40
      const matchingSize = HEAD_SIZE_PRESETS.find(s => 
        Math.abs(s.width - headWidth) < 5
      )
      if (matchingSize) {
        setHeadSizePreset(matchingSize.id)
      }
      setIsInitialLoad(false)
    } else if (!config) {
      setIsInitialLoad(false)
    }
  }, [config, isInitialLoad])

  // Update parent when selections change (but not on initial load)
  useEffect(() => {
    if (!isInitialLoad) {
      const newConfig = presetToConfig(selectedPreset, headSizePreset)
      onChange(newConfig)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPreset, headSizePreset, isInitialLoad])

  // Generate preview image for a preset
  const generatePreview = async (presetId: string) => {
    if (previewImages[presetId]) return // Already generated
    
    setGeneratingPreview(presetId)
    try {
      const preset = POSITION_PRESETS.find(p => p.id === presetId) || POSITION_PRESETS[0]
      const prompt = `Simple head and shoulders portrait character positioning reference, head top at ${preset.headTopY}% from top, eye line at ${preset.eyeLineY}%, shoulders at ${preset.shoulderY}%, ${preset.description.toLowerCase()}, clean white background, minimal illustration style, positioning guide only`
      
      const response = await fetch('/api/collections/position-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, presetId }),
      })

      if (response.ok) {
        const data = await response.json()
        setPreviewImages(prev => ({
          ...prev,
          [presetId]: data.imageUrl
        }))
      }
    } catch (error) {
      console.error('Failed to generate preview:', error)
    } finally {
      setGeneratingPreview(null)
    }
  }

  const currentPreset = POSITION_PRESETS.find(p => p.id === selectedPreset) || POSITION_PRESETS[0]
  const currentSize = HEAD_SIZE_PRESETS.find(s => s.id === headSizePreset) || HEAD_SIZE_PRESETS[1]

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-white mb-1">Character Positioning</h4>
        <p className="text-xs text-white/70">
          Choose a preset positioning style. The AI will use these exact coordinates for all generated ordinals.
        </p>
      </div>

      {/* Position Preset Selector */}
      <div className="space-y-2 sm:space-y-3">
        <label className="block text-xs sm:text-sm font-semibold text-white/80">
          Position Style
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
          {POSITION_PRESETS.map((preset) => {
            const hasPreview = !!previewImages[preset.id]
            const isGenerating = generatingPreview === preset.id
            
            return (
              <div
                key={preset.id}
                className={`relative border-2 rounded-lg p-2 sm:p-3 md:p-4 cursor-pointer transition-all ${
                  selectedPreset === preset.id
                    ? 'border-[#00d4ff] bg-[#00d4ff]/10 shadow-lg shadow-[#00d4ff]/20 cosmic-card'
                    : 'border-[#00d4ff]/30 cosmic-card hover:border-[#00d4ff]/50'
                }`}
                onClick={() => setSelectedPreset(preset.id)}
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  {/* Preview area */}
                  <div className="flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-white/5 rounded border border-[#00d4ff]/30 overflow-hidden relative">
                    {isGenerating ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/5">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00d4ff]"></div>
                      </div>
                    ) : hasPreview ? (
                      <img
                        src={previewImages[preset.id]}
                        alt={preset.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            generatePreview(preset.id)
                          }}
                          className="text-xs px-2 py-1 bg-[#00d4ff]/20 hover:bg-[#00d4ff]/30 text-[#00d4ff] rounded border border-[#00d4ff]/30"
                        >
                          Generate Preview
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Preset info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        type="radio"
                        name="position-preset"
                        checked={selectedPreset === preset.id}
                        onChange={() => setSelectedPreset(preset.id)}
                        className="w-3 h-3 sm:w-4 sm:h-4 text-[#00d4ff] flex-shrink-0"
                      />
                      <span className="font-semibold text-xs sm:text-sm text-white break-words">{preset.name}</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-white/70 break-words">{preset.description}</p>
                    <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-white/60 space-y-0.5">
                      <div className="break-words">Head: {preset.headTopY}% • Eyes: {preset.eyeLineY}% • Shoulders: {preset.shoulderY}%</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Head Size Preset Selector */}
      <div className="space-y-2 sm:space-y-3">
        <label className="block text-xs sm:text-sm font-semibold text-white/80">
          Head Size
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {HEAD_SIZE_PRESETS.map((size) => (
            <div
              key={size.id}
              className={`border-2 rounded-lg p-2 sm:p-3 cursor-pointer transition-all text-center ${
                headSizePreset === size.id
                  ? 'border-[#00d4ff] bg-[#00d4ff]/10 shadow-md cosmic-card'
                  : 'border-[#00d4ff]/30 cosmic-card hover:border-[#00d4ff]/50'
              }`}
              onClick={() => setHeadSizePreset(size.id)}
            >
              <input
                type="radio"
                name="head-size"
                checked={headSizePreset === size.id}
                onChange={() => setHeadSizePreset(size.id)}
                className="w-3 h-3 sm:w-4 sm:h-4 text-[#00d4ff] mb-1 sm:mb-2"
              />
              <div className="font-semibold text-xs sm:text-sm text-white break-words">{size.name}</div>
              <div className="text-[10px] sm:text-xs text-white/70 mt-0.5 sm:mt-1">
                {size.width}% × {size.height}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current Selection Summary */}
      <div className="p-3 sm:p-4 cosmic-card border-2 border-[#00d4ff]/30 rounded-lg">
        <div className="text-xs sm:text-sm font-semibold text-white mb-2">Selected Configuration:</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs text-white/80">
          <div>
            <span className="font-medium">Position:</span> {currentPreset.name}
          </div>
          <div>
            <span className="font-medium">Head Size:</span> {currentSize.name}
          </div>
          <div>
            <span className="font-medium">Head Position:</span> {currentPreset.headTopY}% from top
          </div>
          <div>
            <span className="font-medium">Head Dimensions:</span> {currentSize.width}% × {currentSize.height}%
          </div>
          <div>
            <span className="font-medium">Shoulder Width:</span> {currentPreset.shoulderRightX - currentPreset.shoulderLeftX}%
          </div>
          <div>
            <span className="font-medium">Bottom Crop:</span> {currentPreset.bottomY}% from top
          </div>
        </div>
      </div>
    </div>
  )
}
