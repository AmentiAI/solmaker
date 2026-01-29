import { NextRequest, NextResponse } from 'next/server';
import { CREDIT_TIERS } from '@/lib/credits/constants';
import { sql } from '@/lib/database';

// POST /api/credits/purchase - Create a credit purchase request
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { wallet_address, tier_index } = body;

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    if (tier_index === undefined || tier_index < 0 || tier_index >= CREDIT_TIERS.length) {
      return NextResponse.json({ error: 'Invalid tier index' }, { status: 400 });
    }

    const tier = CREDIT_TIERS[tier_index];
    
    // Use the fixed payment address
    const paymentAddress = process.env.FEE_WALLET || 'bc1p693zz6n9cvmsewemg4j0pmvfvs4th3ft9c74afrc90l6sah300uqt99vee'
    
    // Calculate Bitcoin amount (fetch current BTC/USD rate from API)
    let BTC_USD_RATE = 40000; // Default fallback
    try {
      // Try multiple APIs for better reliability
      const apis = [
        'https://api.coindesk.com/v1/bpi/currentprice/USD.json',
        'https://api.coinbase.com/v2/exchange-rates?currency=BTC',
        'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'
      ];
      
      for (const apiUrl of apis) {
        try {
          const response = await fetch(apiUrl, { 
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          if (response.ok) {
            const data = await response.json();
            
            // Parse different API formats
            if (apiUrl.includes('coindesk')) {
              BTC_USD_RATE = parseFloat(data.bpi.USD.rate.replace(/,/g, ''));
            } else if (apiUrl.includes('coinbase')) {
              BTC_USD_RATE = parseFloat(data.data.rates.USD);
            } else if (apiUrl.includes('binance')) {
              BTC_USD_RATE = parseFloat(data.price);
            }
            
            if (BTC_USD_RATE > 0) {
              console.log(`✅ Fetched BTC price from ${apiUrl}: $${BTC_USD_RATE}`);
              break;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch from ${apiUrl}:`, err);
          continue;
        }
      }
    } catch (error) {
      console.error('Error fetching BTC price, using default:', error);
    }
    
    // Ensure we have a valid rate
    if (!BTC_USD_RATE || BTC_USD_RATE <= 0) {
      BTC_USD_RATE = 40000;
      console.warn('Using fallback BTC price:', BTC_USD_RATE);
    }
    
    const bitcoinAmount = (tier.totalPrice / BTC_USD_RATE).toFixed(8);
    console.log(`💰 Calculating: $${tier.totalPrice} / $${BTC_USD_RATE} = ${bitcoinAmount} BTC`);

    // Create pending payment (expires in 1 hour)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const result = await sql`
      INSERT INTO pending_payments (
        wallet_address,
        credits_amount,
        bitcoin_amount,
        payment_address,
        expires_at,
        payment_txid,
        confirmations
      )
      VALUES (
        ${wallet_address},
        ${tier.credits},
        ${bitcoinAmount},
        ${paymentAddress},
        ${expiresAt.toISOString()},
        NULL,
        0
      )
      RETURNING id, payment_address, bitcoin_amount, expires_at, created_at
    `;

    const resultArray = result as any[];
    if (!Array.isArray(resultArray) || resultArray.length === 0) {
      return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 });
    }

    const payment = resultArray[0];
    if (!payment) {
      return NextResponse.json({ error: 'Payment record not created' }, { status: 500 });
    }

    return NextResponse.json({
      paymentId: payment.id,
      paymentAddress: payment.payment_address,
      bitcoinAmount: payment.bitcoin_amount,
      creditsAmount: tier.credits,
      expiresAt: payment.expires_at,
      qrCode: `bitcoin:${payment.payment_address}?amount=${payment.bitcoin_amount}`,
    });
  } catch (error: any) {
    console.error('Error creating purchase:', error);
    return NextResponse.json({ 
      error: error?.message || 'Failed to create purchase' 
    }, { status: 500 });
  }
}

