'use client'

import { useEffect } from 'react'

interface ProgressStep {
  id: string
  label: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  details?: string
}

interface CollectionCreationProgressModalProps {
  isOpen: boolean
  steps: ProgressStep[]
  currentStep: number
  error?: string
}

export function CollectionCreationProgressModal({
  isOpen,
  steps,
  currentStep,
  error
}: CollectionCreationProgressModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Creating Collection
            </h2>
            {!error && (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400"></div>
            )}
          </div>

          {error ? (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
              <p className="text-red-300 font-semibold">Error</p>
              <p className="text-red-200 text-sm mt-1">{error}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {steps.map((step, index) => {
                const isActive = index === currentStep
                const isCompleted = index < currentStep
                const isPending = index > currentStep

                return (
                  <div
                    key={step.id}
                    className={`flex items-start gap-4 p-4 rounded-lg border transition-all duration-300 ${
                      isActive
                        ? 'bg-purple-900/20 border-purple-500/50 shadow-lg shadow-purple-500/20'
                        : isCompleted
                        ? 'bg-green-900/10 border-green-700/30'
                        : 'bg-gray-800/30 border-gray-700/30 opacity-60'
                    }`}
                  >
                    {/* Status Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {isCompleted ? (
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : isActive ? (
                        <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                          <div className="w-3 h-3 rounded-full bg-[#FDFCFA] animate-pulse"></div>
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-600 border-2 border-gray-500"></div>
                      )}
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p
                          className={`font-semibold transition-colors ${
                            isActive ? 'text-white' : isCompleted ? 'text-green-300' : 'text-gray-400'
                          }`}
                        >
                          {step.label}
                        </p>
                        {isActive && (
                          <span className="text-xs text-purple-300 font-medium animate-pulse">
                            Processing...
                          </span>
                        )}
                      </div>
                      {step.details && (
                        <p className="text-sm text-purple-300 mt-1 font-medium">{step.details}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!error && currentStep < steps.length && (
            <div className="mt-6 pt-6 border-t border-gray-800">
              <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span>This may take a few minutes...</span>
              </div>
            </div>
          )}
          
          {!error && currentStep >= steps.length && (
            <div className="mt-6 pt-6 border-t border-gray-800">
              <div className="flex items-center justify-center gap-2 text-sm text-green-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-semibold">Collection created successfully!</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

