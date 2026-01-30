'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAuthorized } from '@/lib/auth/access-control'
import { WalletConnect } from '@/components/wallet-connect'
import Link from 'next/link'

interface Ticket {
  id: string
  wallet_address: string
  subject: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
  updated_at: string
  message_count?: number
}

interface Message {
  id: string
  message: string
  sender_type: 'user' | 'admin'
  sender_wallet_address: string | null
  created_at: string
}

export default function AdminSupportPage() {
  const { isConnected, currentAddress } = useWallet()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const authorized = isAuthorized(currentAddress)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load tickets when authorized
  useEffect(() => {
    if (isConnected && currentAddress && authorized) {
      loadTickets()
      trackVisit()
    } else {
      setTickets([])
      setSelectedTicket(null)
      setMessages([])
    }
  }, [isConnected, currentAddress, authorized])

  const trackVisit = async () => {
    if (!currentAddress) return
    
    try {
      // Get user agent
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null
      
      await fetch('/api/admin/track-visit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: currentAddress,
          user_agent: userAgent,
        }),
      })
    } catch (error) {
      // Silently fail - don't interrupt the admin page if tracking fails
      console.error('Failed to track admin visit:', error)
    }
  }

  // Poll for new messages when a ticket is selected
  useEffect(() => {
    if (!selectedTicket || !currentAddress || !authorized) return

    loadMessages(selectedTicket.id)
    
    // Poll every 3 seconds for new messages
    const interval = setInterval(() => {
      loadMessages(selectedTicket.id)
    }, 3000)

    return () => clearInterval(interval)
  }, [selectedTicket, currentAddress, authorized])

  const loadTickets = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/support/admin/tickets?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setTickets(data.tickets || [])
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to load tickets')
      }
    } catch (err) {
      console.error('Error loading tickets:', err)
      setError('Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (ticketId: string) => {
    if (!currentAddress) return

    try {
      const response = await fetch(`/api/support/tickets/${ticketId}/messages?wallet_address=${encodeURIComponent(currentAddress)}&admin=true`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      }
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTicket || !currentAddress || !newMessage.trim()) return

    setSending(true)
    setError(null)

    try {
      const response = await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          message: newMessage.trim(),
          is_admin: true,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to send message')
        return
      }

      setNewMessage('')
      await loadMessages(selectedTicket.id)
      await loadTickets() // Refresh ticket list to update message count
    } catch (err) {
      console.error('Error sending message:', err)
      setError('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleUpdateStatus = async (status: string) => {
    if (!selectedTicket || !currentAddress) return

    try {
      const response = await fetch(`/api/support/admin/tickets/${selectedTicket.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: currentAddress,
          status,
        }),
      })

      if (response.ok) {
        await loadTickets()
        const data = await response.json()
        setSelectedTicket(data.ticket)
      }
    } catch (err) {
      console.error('Error updating status:', err)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-900/30 text-blue-300 border-blue-700'
      case 'in_progress':
        return 'bg-yellow-900/30 text-yellow-300 border-[#FBBF24]/20'
      case 'resolved':
        return 'bg-green-900/30 text-green-300 border-green-700'
      case 'closed':
        return 'bg-[#1a1a24] text-[#a8a8b8] border-[#9945FF]/20'
      default:
        return 'bg-[#1a1a24] text-[#a8a8b8] border-[#9945FF]/20'
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-4">
              Admin Support Center
            </h1>
            <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-8 text-center shadow-xl">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold text-white mb-4">Connect Wallet</h2>
              <p className="text-[#a8a8b8] mb-6">
                Please connect your wallet to access the admin support center.
              </p>
              <div className="flex justify-center mb-6">
                <WalletConnect />
              </div>
              <Link
                href="/support"
                className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all duration-200"
              >
                Go to Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-4">
              Admin Support Center
            </h1>
            <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-8 text-center shadow-xl">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold text-white mb-4">Unauthorized</h2>
              <p className="text-[#a8a8b8] mb-6">
                You must be an authorized admin to access this page.
              </p>
              <Link
                href="/support"
                className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all duration-200"
              >
                Go to Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-2">
                Admin Support Center
              </h1>
              <p className="text-[#a8a8b8]">Manage and respond to support tickets</p>
            </div>
            <Link
              href="/support"
              className="px-4 py-2 bg-[#1a1a24]/80 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all duration-200"
            >
              User View
            </Link>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-[#EF4444]/20 rounded-lg text-red-200">
              {error}
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Tickets List */}
            <div className="lg:col-span-1">
              <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-6 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-white">All Tickets</h2>
                  <button
                    onClick={loadTickets}
                    className="px-3 py-1 bg-[#1a1a24]/80 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-all duration-200"
                  >
                    Refresh
                  </button>
                </div>

                {loading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    <p className="text-[#a8a8b8] mt-2">Loading tickets...</p>
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="text-center py-8 text-[#a8a8b8]">
                    <p>No tickets yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {tickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        onClick={() => {
                          setSelectedTicket(ticket)
                          loadMessages(ticket.id)
                        }}
                        className={`w-full text-left p-4 rounded-lg border transition-all duration-200 ${
                          selectedTicket?.id === ticket.id
                            ? 'border-purple-500 bg-purple-900/20'
                            : 'border-gray-800 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90/50 hover:border-[#9945FF]/20'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-white text-sm">{ticket.subject}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(ticket.status)}`}>
                            {ticket.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-[#a8a8b8] mb-1">
                          {ticket.wallet_address.substring(0, 8)}...
                        </p>
                        <p className="text-xs text-[#a8a8b8]">
                          {new Date(ticket.created_at).toLocaleDateString()}
                        </p>
                        {ticket.message_count && ticket.message_count > 0 && (
                          <p className="text-xs text-blue-400 mt-1">
                            {ticket.message_count} message{ticket.message_count !== 1 ? 's' : ''}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Chat Interface */}
            <div className="lg:col-span-2">
              {selectedTicket ? (
                <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl shadow-xl flex flex-col h-[700px]">
                  <div className="p-6 border-b border-gray-800">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h2 className="text-xl font-bold text-white">{selectedTicket.subject}</h2>
                        <p className="text-sm text-[#a8a8b8] mt-1">
                          Wallet: {selectedTicket.wallet_address}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedTicket(null)
                          setMessages([])
                        }}
                        className="text-[#a8a8b8] hover:text-white"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => handleUpdateStatus(e.target.value)}
                        className="px-3 py-1 bg-[#1a1a24] border border-[#9945FF]/20 rounded-lg text-white text-sm"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-4 ${
                            message.sender_type === 'admin'
                              ? 'bg-gradient-to-r from-green-600 to-blue-600 text-white'
                              : 'bg-[#1a1a24] text-gray-100'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                          <p className="text-xs mt-2 opacity-70">
                            {message.sender_type === 'admin' ? '👨‍💼 You (Admin)' : '👤 User'} • {new Date(message.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <form onSubmit={handleSendMessage} className="p-6 border-t border-gray-800">
                    <div className="flex gap-2">
                      <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSendMessage(e)
                          }
                        }}
                        className="flex-1 border border-[#9945FF]/20 rounded-lg px-4 py-3 bg-slate-950/50 text-gray-100 placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none resize-none"
                        placeholder="Type your response... (Press Enter to send, Shift+Enter for new line)"
                        rows={2}
                        required
                      />
                      <button
                        type="submit"
                        disabled={sending || !newMessage.trim()}
                        className="px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sending ? '...' : 'Send'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24]/50 border border-gray-800 rounded-xl p-12 shadow-xl text-center h-[700px] flex items-center justify-center">
                  <div>
                    <div className="text-6xl mb-4">💬</div>
                    <h3 className="text-xl font-bold text-white mb-2">Select a Ticket</h3>
                    <p className="text-[#a8a8b8]">
                      Select a ticket from the list to view and respond
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}




