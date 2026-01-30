'use client'

import { useState, useRef, useEffect } from 'react'

export function InstructionsDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    // Use a slight delay to avoid closing immediately when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 100)
    
    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200 flex items-center gap-1"
      >
        <span>📚</span> Guide
        <svg 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-h-[80vh] overflow-y-auto bg-[#FDFCFA] backdrop-blur-xl border border-gray-200 rounded-xl shadow-2xl shadow-gray-200/50 z-[9999] p-4">
          <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span>📚</span> Complete Trait-Based Generation Guide
          </h3>
          
          <div className="space-y-3 text-xs text-gray-900">
            {/* Step 1: Creating Layers */}
            <div className="bg-[#4561ad]/5 border border-[#4561ad]/20 rounded-lg p-3">
              <h4 className="font-semibold text-[#4561ad] mb-1.5 flex items-center gap-2 text-xs">
                <span className="bg-[#4561ad] text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">1</span>
                Creating Layers & Traits
              </h4>
              <ol className="list-decimal list-inside space-y-1 ml-6 text-xs">
                <li><strong>Add Layers:</strong> Click "Add Layer" to create trait categories (e.g., "Background", "Character", "Accessories", "Eyes", "Mouth", "Headwear", "Outfits", "Props")</li>
                <li><strong>Set Display Order:</strong> Layers are rendered in order - lower numbers appear behind higher numbers (like Photoshop layers)</li>
                <li><strong>Add Traits to Each Layer:</strong> Click "View Traits" on a layer, then "Create Trait" to add individual options</li>
                <li><strong>Trait Details:</strong> For each trait, provide:
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                    <li><strong>Name:</strong> Short name (e.g., "Red Background", "Vampire Fangs")</li>
                    <li><strong>Description:</strong> Detailed description for AI generation</li>
                    <li><strong>Trait Prompt:</strong> Specific AI prompt text for this trait</li>
                  </ul>
                </li>
                <li><strong>Example:</strong> For a "Background" layer, you might add traits like "Blood Moon Graveyard", "Haunted Forest", "Cursed Carnival", etc.</li>
              </ol>
            </div>

            {/* Step 2: Random Generation */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <h4 className="font-semibold text-green-700 mb-1.5 flex items-center gap-2 text-xs">
                <span className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">2</span>
                Random Generation (All Traits Randomized)
              </h4>
              <ol className="list-decimal list-inside space-y-1 ml-6 text-xs">
                <li><strong>Ensure All Layers Have Traits:</strong> Every layer must have at least one trait before generating</li>
                <li><strong>Set Quantity:</strong> Choose how many NFTs to generate (1-100)</li>
                <li><strong>Click "Generate NFTs":</strong> The system will randomly select one trait from each layer</li>
                <li><strong>Result:</strong> Each generated NFT will have a unique random combination of traits from all layers</li>
                <li><strong>Example:</strong> NFT #1 might get "Blood Moon Graveyard" background + "Vampire" character + "Red Eyes" + "Fangs" mouth, while NFT #2 gets completely different traits</li>
              </ol>
            </div>

            {/* Step 3: Filtered Generation */}
            <div className="bg-[#e27d0f]/5 border border-[#e27d0f]/20 rounded-lg p-3">
              <h4 className="font-semibold text-[#e27d0f] mb-1.5 flex items-center gap-2 text-xs">
                <span className="bg-[#e27d0f] text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">3</span>
                Filtered Generation (Generate Specific Characters)
              </h4>
              <ol className="list-decimal list-inside space-y-1 ml-6 text-xs">
                <li><strong>Open Filters:</strong> Click "▶ Show Filters" above the generation section</li>
                <li><strong>Select Specific Traits:</strong> For each layer, choose a specific trait from the dropdown (or leave as "All [Layer Name]" for random)</li>
                <li><strong>Example - Generate a Specific Character:</strong>
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-1 text-[10px]">
                    <li>Background: "Blood Moon Graveyard"</li>
                    <li>Character: "Vampire"</li>
                    <li>Eyes: "Vampire Red"</li>
                    <li>Mouth: "Vampire Fangs"</li>
                    <li>Headwear: "Crown" (or leave as "All Headwear" for random)</li>
                    <li>Outfits: "Royal Robes" (or leave as "All Outfits" for random)</li>
                  </ul>
                </li>
                <li><strong>Partial Filters:</strong> You can filter some layers and leave others random. Only filtered layers will be fixed; others will be randomized</li>
                <li><strong>Generate:</strong> Click "⚠️ Generate NFTs (Filtered)" - the button will turn orange when filters are active</li>
                <li><strong>Result:</strong> All generated NFTs will have the filtered traits, with remaining layers randomized</li>
                <li><strong>Use Case:</strong> Perfect for creating variations of a specific character design or ensuring certain traits always appear together</li>
              </ol>
            </div>

            {/* Step 4: Understanding the System */}
            <div className="bg-[#4561ad]/5 border border-[#4561ad]/20 rounded-lg p-3">
              <h4 className="font-semibold text-[#4561ad] mb-1.5 flex items-center gap-2 text-xs">
                <span className="bg-[#4561ad] text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">4</span>
                How It Works
              </h4>
              <ul className="list-disc list-inside space-y-1 ml-6 text-xs">
                <li><strong>Layer System:</strong> Think of layers like Photoshop - each layer contains traits that can be combined</li>
                <li><strong>Trait Selection:</strong> For each generation, one trait is selected from each layer (either randomly or via filters)</li>
                <li><strong>AI Generation:</strong> The selected traits are combined into a detailed prompt that the AI uses to generate the image</li>
                <li><strong>Consistency:</strong> The same trait combination will always generate the same image (duplicate detection prevents re-generating identical combinations)</li>
                <li><strong>Credits:</strong> Credits are deducted before generation. Make sure you have enough credits before generating</li>
                <li><strong>Processing Time:</strong> Generations are queued and processed within 5 minutes</li>
              </ul>
            </div>

            {/* Step 5: Collaboration */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <h4 className="font-semibold text-indigo-700 mb-1.5 flex items-center gap-2 text-xs">
                <span className="bg-indigo-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">5</span>
                Collaboration Features
              </h4>
              <ul className="list-disc list-inside space-y-1 ml-6 text-xs">
                <li><strong>Invite Collaborators:</strong> Click "+ Invite" in the Collaborators section on your collection page</li>
                <li><strong>Invite by Username or Wallet:</strong> Enter a username (if they have a profile) or wallet address</li>
                <li><strong>Roles:</strong> Choose "Editor" (can edit and generate) or "Viewer" (read-only access)</li>
                <li><strong>Permissions:</strong> Only owners and editors can invite others. Owners can remove any collaborator</li>
                <li><strong>Shared Collections:</strong> Collaborators will see the collection in their collections list</li>
              </ul>
            </div>

            {/* Step 6: Image Compression */}
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
              <h4 className="font-semibold text-teal-700 mb-1.5 flex items-center gap-2 text-xs">
                <span className="bg-teal-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">6</span>
                Image Compression & Download
              </h4>
              <ul className="list-disc list-inside space-y-1 ml-6 text-xs">
                <li><strong>Automatic Compression:</strong> Images are automatically compressed during generation if compression settings are configured</li>
                <li><strong>Compression Settings:</strong> Set quality (%), dimensions (px), or target file size (KB) in collection settings</li>
                <li><strong>Target KB:</strong> Set a specific file size target - images will be compressed to match that size</li>
                <li><strong>View Both Versions:</strong> Original and compressed images are shown side-by-side for comparison</li>
                <li><strong>Download Options:</strong> "Download All Images" gets originals, "Compress & Download All" gets compressed versions</li>
                <li><strong>Individual Downloads:</strong> Right-click any image to download the compressed version (if available)</li>
              </ul>
            </div>

            {/* Tips */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <h4 className="font-semibold text-yellow-700 mb-1.5 flex items-center gap-2 text-xs">
                <span>💡</span> Pro Tips
              </h4>
              <ul className="list-disc list-inside space-y-1 ml-6 text-xs">
                <li>Start with 3-5 layers to test your collection before adding more</li>
                <li>Add 5-10 traits per layer for good variety without overwhelming options</li>
                <li>Use filters to create themed subsets (e.g., all "Vampire" characters with different backgrounds)</li>
                <li>Preview prompts before generating to see how traits will be combined</li>
                <li>Check existing NFTs to see what combinations have already been generated</li>
                <li>Use descriptive trait names and detailed descriptions for better AI results</li>
                <li>Invite team members to help build your collection - they can add layers and traits</li>
                <li>Set compression target KB for consistent file sizes across your collection</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}




