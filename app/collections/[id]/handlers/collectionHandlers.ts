import { GeneratedOrdinal } from '../types'
import JSZip from 'jszip'
import { toast } from 'sonner'

export const collectionHandlers = {
  handleDownloadOrdinal: async (ordinal: GeneratedOrdinal) => {
    try {
      const zip = new JSZip()
      const ordinalNum = ordinal.ordinal_number || ordinal.id
      const folderName = `ordinal-${ordinalNum}`
      const folder = zip.folder(folderName)
      const imageUrl = ordinal.compressed_image_url || ordinal.image_url
      const imageResponse = await fetch(imageUrl)
      const imageBlob = await imageResponse.blob()
      folder?.file(`image.png`, imageBlob)
      const traitsData = {
        ordinal_number: ordinal.ordinal_number,
        traits: ordinal.traits,
        prompt: ordinal.prompt,
        image_url: ordinal.image_url,
        metadata_url: ordinal.metadata_url,
        created_at: ordinal.created_at,
      }
      const traitsJson = JSON.stringify(traitsData, null, 2)
      folder?.file(`traits.json`, traitsJson)
      const content = await zip.generateAsync({ type: 'blob' })
      const url = window.URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `ordinal-${ordinalNum}-image-and-traits.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to download ordinal:', error)
      toast.error('Download Failed', { description: 'Failed to download ordinal. Please try again.' })
    }
  },
}

