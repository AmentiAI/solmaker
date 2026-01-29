/**
 * Art Style Configuration
 * 
 * These art styles are available for collection creation.
 * Preview images should be generated using: node scripts/generate-art-style-previews.js
 * Real collection examples are fetched from /api/art-style-examples
 * 
 * NOTE: This file is used by both client and server components.
 * React hooks are in a separate file: lib/art-styles-client.ts
 */

export interface ArtStyle {
  id: string
  name: string
  description: string
  previewImage: string  // Static fallback image
  promptStyle: string  // Used in the generation prompt
}

// Get the preview image for an art style - use real example if available
export function getArtStylePreviewImage(
  styleId: string, 
  realExamples: Record<string, string | null> = {}
): string {
  // If we have a real example, use it
  if (realExamples[styleId]) {
    return realExamples[styleId]!
  }
  // Otherwise use static fallback
  const style = ART_STYLES.find(s => s.id === styleId)
  return style?.previewImage || '/art-styles/chibi.png'
}

export const ART_STYLES: ArtStyle[] = [
  {
    id: 'chibi',
    name: 'Chibi / Cute',
    description: 'Oversized head, huge eyes, adorable expressions',
    previewImage: '/art-styles/chibi.png',
    promptStyle: 'Chibi style with oversized head, huge expressive eyes, adorable kawaii aesthetic, clean vector art, vibrant colors, cute rounded features'
  },
  {
    id: 'anime',
    name: 'Anime / Manga',
    description: 'Japanese animation style with expressive features',
    previewImage: '/art-styles/anime.png',
    promptStyle: 'Anime style, Japanese animation aesthetic, detailed eyes with highlights, stylized hair, cel-shaded coloring, clean linework'
  },
  {
    id: 'realistic',
    name: 'Realistic / Photorealistic',
    description: 'Lifelike proportions and detailed textures',
    previewImage: '/art-styles/realistic.png',
    promptStyle: 'Photorealistic style, detailed textures, realistic lighting, high detail, 8k quality'
  },
  {
    id: 'pixel',
    name: 'Pixel Art',
    description: 'Retro game-inspired blocky pixels',
    previewImage: '/art-styles/pixel.png',
    promptStyle: 'Pixel art style, 32-bit retro game aesthetic, blocky pixels, limited color palette, nostalgic video game look'
  },
  {
    id: 'cartoon',
    name: 'Western Cartoon',
    description: 'Bold outlines, exaggerated features',
    previewImage: '/art-styles/cartoon.png',
    promptStyle: 'Western cartoon style, bold black outlines, exaggerated features, flat colors, playful expression'
  },
  {
    id: 'watercolor',
    name: 'Watercolor / Painterly',
    description: 'Soft edges, flowing colors, artistic texture',
    previewImage: '/art-styles/watercolor.png',
    promptStyle: 'Watercolor painting style, soft flowing colors, visible brush strokes, artistic texture, dreamy aesthetic'
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk / Neon',
    description: 'Futuristic, neon lights, tech aesthetic',
    previewImage: '/art-styles/cyberpunk.png',
    promptStyle: 'Cyberpunk style, neon lights, futuristic tech aesthetic, glowing accents, dark background with neon highlights, sci-fi vibes'
  },
  {
    id: 'fantasy',
    name: 'Fantasy / Epic',
    description: 'Magical, detailed, dramatic lighting',
    previewImage: '/art-styles/fantasy.png',
    promptStyle: 'Epic fantasy style, magical glow effects, dramatic lighting, mystical atmosphere, rich colors'
  },
  {
    id: 'minimalist',
    name: 'Minimalist / Flat',
    description: 'Simple shapes, limited colors, clean design',
    previewImage: '/art-styles/minimalist.png',
    promptStyle: 'Minimalist flat design, simple geometric shapes, limited color palette, clean lines, modern aesthetic'
  },
  {
    id: 'graffiti',
    name: 'Street Art / Graffiti',
    description: 'Urban, bold colors, spray paint texture',
    previewImage: '/art-styles/graffiti.png',
    promptStyle: 'Street art graffiti style, bold spray paint colors, urban aesthetic, dripping paint effects, hip-hop culture vibes'
  },
  {
    id: '3d-cartoon',
    name: '3D Cartoon',
    description: 'Pixar/Disney style 3D rendered characters',
    previewImage: '/art-styles/3d-cartoon.png',
    promptStyle: '3D cartoon style, Pixar/Disney aesthetic, smooth rendered surfaces, stylized 3D character, soft lighting, vibrant colors, professional 3D animation quality'
  },
  {
    id: 'low-poly',
    name: 'Low Poly / Geometric',
    description: 'Angular geometric shapes, faceted surfaces, modern 3D',
    previewImage: '/art-styles/low-poly.png',
    promptStyle: 'Low poly geometric style, angular faceted surfaces, geometric shapes, modern 3D aesthetic, clean edges, minimalist polygons, vibrant flat colors'
  },
  {
    id: 'abstract',
    name: 'Abstract / Surreal',
    description: 'Non-representational, dreamlike, artistic expression',
    previewImage: '/art-styles/abstract.png',
    promptStyle: 'Abstract surreal style, non-representational art, dreamlike aesthetic, flowing forms, artistic expression, vibrant colors, imaginative composition'
  },
  {
    id: 'vintage',
    name: 'Vintage / Retro',
    description: 'Nostalgic, aged aesthetic, classic design',
    previewImage: '/art-styles/vintage.png',
    promptStyle: 'Vintage retro style, nostalgic aesthetic, aged textures, classic design elements, muted color palette, retro-futuristic vibes, timeless appeal'
  },
  {
    id: 'hand-drawn',
    name: 'Hand-drawn / Sketch',
    description: 'Organic lines, sketchy, artistic hand-drawn feel',
    previewImage: '/art-styles/hand-drawn.png',
    promptStyle: 'Hand-drawn sketch style, organic lines, artistic pencil work, sketchy aesthetic, natural imperfections, expressive strokes, artistic illustration'
  },
  {
    id: 'glitch',
    name: 'Glitch / Digital Art',
    description: 'Digital artifacts, data corruption aesthetic, cyber',
    previewImage: '/art-styles/glitch.png',
    promptStyle: 'Glitch art style, digital corruption effects, data artifacts, cyber aesthetic, RGB color separation, pixelated distortions, digital noise, futuristic glitch vibes'
  },
  {
    id: 'custom',
    name: 'Custom Style',
    description: 'Define your own art style in the description',
    previewImage: '/art-styles/custom.png',
    promptStyle: '' // User defines in art_style field
  }
]

export function getArtStyleById(id: string): ArtStyle | undefined {
  return ART_STYLES.find(style => style.id === id)
}

export function getArtStylePrompt(id: string): string {
  const style = getArtStyleById(id)
  return style?.promptStyle || ''
}

