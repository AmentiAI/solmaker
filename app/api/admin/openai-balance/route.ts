import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth/access-control'

/**
 * GET /api/admin/openai-balance - Get OpenAI API credit balance
 * Admin only endpoint
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    // Check admin authorization
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    // Try to get credit grants (for prepaid credits)
    let creditData = null
    try {
      const creditRes = await fetch('https://api.openai.com/v1/dashboard/billing/credit_grants', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })
      if (creditRes.ok) {
        creditData = await creditRes.json()
      }
    } catch (e) {
      console.error('Failed to fetch credit grants:', e)
    }

    // Try to get subscription info
    let subscriptionData = null
    try {
      const subRes = await fetch('https://api.openai.com/v1/dashboard/billing/subscription', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })
      if (subRes.ok) {
        subscriptionData = await subRes.json()
      }
    } catch (e) {
      console.error('Failed to fetch subscription:', e)
    }

    // Try to get current month usage
    let usageData = null
    try {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const startDate = startOfMonth.toISOString().split('T')[0]
      const endDate = now.toISOString().split('T')[0]
      
      const usageRes = await fetch(
        `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        }
      )
      if (usageRes.ok) {
        usageData = await usageRes.json()
      }
    } catch (e) {
      console.error('Failed to fetch usage:', e)
    }

    // Calculate balance
    let balance = null
    let totalUsed = null
    let totalGranted = null

    if (creditData) {
      balance = creditData.total_available ?? null
      totalUsed = creditData.total_used ?? null
      totalGranted = creditData.total_granted ?? null
    }

    // If we have subscription data with a hard limit, use that
    if (subscriptionData?.hard_limit_usd) {
      const hardLimit = subscriptionData.hard_limit_usd
      const currentUsage = usageData?.total_usage ? usageData.total_usage / 100 : 0 // usage is in cents
      balance = balance ?? (hardLimit - currentUsage)
    }

    return NextResponse.json({
      success: true,
      balance,
      total_used: totalUsed,
      total_granted: totalGranted,
      subscription: subscriptionData ? {
        plan: subscriptionData.plan?.title || 'Unknown',
        hard_limit: subscriptionData.hard_limit_usd,
        soft_limit: subscriptionData.soft_limit_usd,
      } : null,
      current_month_usage: usageData?.total_usage ? usageData.total_usage / 100 : null, // Convert cents to dollars
    })
  } catch (error: any) {
    console.error('Error fetching OpenAI balance:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch OpenAI balance',
      details: error.message 
    }, { status: 500 })
  }
}

