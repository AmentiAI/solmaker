'use client'

import React from 'react'

type Step = 1 | 2 | 3 | 4 | 5

interface StepNavigationProps {
  currentStep: Step
  collectionName: string
  collectionId: string
  onStepClick?: (step: Step) => void
}

const steps = [
  { number: 1, title: 'Collection Settings', description: 'Configure your collection details and media' },
  { number: 2, title: 'Mint Phases', description: 'Set up your minting phases' },
  { number: 3, title: 'Whitelists', description: 'Create whitelists for exclusive mints' },
  { number: 4, title: 'Review', description: 'Review your launch configuration' },
  { number: 5, title: 'Launch', description: 'Go live with your collection' },
]

export function StepNavigation({ currentStep, collectionName, collectionId, onStepClick }: StepNavigationProps) {
  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#4561ad] to-[#e27d0f] bg-clip-text text-transparent">
              Launch Collection
            </h1>
            <p className="text-[#a8a8b8]/80 mt-1">{collectionName}</p>
          </div>
          <a
            href={`/collections/${collectionId}`}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition-colors"
          >
            ← Back to Collection
          </a>
        </div>
      </div>
      
      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, idx) => (
            <React.Fragment key={step.number}>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => onStepClick?.(step.number as Step)}
                  disabled={!onStepClick}
                  className={`flex flex-col items-center transition-all ${
                    currentStep >= step.number ? 'text-[#4561ad]' : 'text-[#a8a8b8]'
                  } ${onStepClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border-2 transition-all ${
                    currentStep > step.number 
                      ? 'bg-[#4561ad] text-white border-[#4561ad]' 
                      : currentStep === step.number
                      ? 'bg-[#4561ad] text-white border-[#4561ad]'
                      : 'bg-white border-gray-300'
                  } ${onStepClick && currentStep !== step.number ? 'hover:border-[#4561ad] hover:bg-[#4561ad]/10' : ''}`}>
                    {currentStep > step.number ? '✓' : step.number}
                  </div>
                  <div className="mt-2 text-center">
                    <div className="text-sm font-semibold">{step.title}</div>
                    <div className="text-xs text-[#a8a8b8]/80">{step.description}</div>
                  </div>
                </button>
              </div>
              {idx < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-4 ${currentStep > step.number ? 'bg-[#4561ad]' : 'bg-gray-300'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  )
}

