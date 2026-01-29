/**
 * Image generation cost estimation (credits).
 * Used by debug-center, generate-simple, and promptestimator pages.
 * Cost is per image in credits; prompt length does not affect cost (OpenAI charges per image).
 */

export type ImageSize = '1024x1024' | '1024x1792' | '1792x1024'
export type ImageQuality = 'standard' | 'hd'

export interface ImageGenerationCost {
  total: number
  perImage: number
  quantity: number
}

const DEFAULT_CREDITS_PER_IMAGE = 1.0

/**
 * Build full prompt from description, border style, art style, and optional phase/batch context.
 */
export function buildFullPrompt(
  description: string,
  borderStyle: string,
  artStyle: string,
  _phaseIndex?: number,
  _batchCount?: number
): string {
  const parts = [description.trim(), borderStyle.trim(), artStyle.trim()].filter(Boolean)
  return parts.join(', ')
}

/**
 * Estimate credit cost for image generation.
 * Cost is per image (default 1 credit); prompt length does not change cost.
 */
export function estimateImageGenerationCost(
  _fullPrompt: string,
  quantity: number,
  _imageSize?: ImageSize,
  _quality?: ImageQuality
): ImageGenerationCost {
  const perImage = DEFAULT_CREDITS_PER_IMAGE
  const total = Math.ceil(perImage * quantity)
  return { total, perImage, quantity }
}

/**
 * Format cost for display (e.g. "1 credit", "5 credits").
 */
export function formatCost(cost: number): string {
  if (cost === 1) return '1 credit'
  return `${cost} credits`
}
