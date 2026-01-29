import { NextRequest, NextResponse } from 'next/server';
import { CREDIT_TIERS } from '@/lib/credits/constants';
import { sql } from '@/lib/database';

// Payment address to receive Bitcoin
const PAYMENT_ADDRESS = process.env.FEE_WALLET || 'bc1p693zz6n9cvmsewemg4j0pmvfvs4th3ft9c74afrc90l6sah300uqt99vee'

// POST /api/credits/create-payment-psbt - Create a PSBT for credit purchase
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { wallet_address, tier_index, fee_rate } = body;

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    if (tier_index === undefined || tier_index < 0 || tier_index >= CREDIT_TIERS.length) {
      return NextResponse.json({ error: 'Invalid tier index' }, { status: 400 });
    }

    const tier = CREDIT_TIERS[tier_index];
    
    // Calculate Bitcoin amount (fetch current BTC/USD rate from API)
    let BTC_USD_RATE = 40000; // Default fallback
    try {
      // Try multiple APIs for better reliability
      const apis = [
        'https://api.coinbase.com/v2/exchange-rates?currency=BTC',
        'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
        'https://api.coindesk.com/v1/bpi/currentprice/USD.json'
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
        } catch (err: any) {
          // Log a cleaner error message for network failures (expected behavior with fallbacks)
          const errorMessage = err?.message || err?.code || 'Unknown error';
          console.warn(`⚠️ Failed to fetch from ${apiUrl}: ${errorMessage}`);
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
    
    const bitcoinAmount = tier.totalPrice / BTC_USD_RATE;
    const bitcoinAmountSats = Math.ceil(bitcoinAmount * 100000000); // Convert to satoshis
    
    // Use provided fee rate or fetch current fee rate
    let finalFeeRate = fee_rate || 10; // Default 10 sat/vB
    if (!fee_rate) {
      try {
        const feeResponse = await fetch('https://mempool.space/api/v1/fees/recommended', {
          signal: AbortSignal.timeout(5000),
        });
        if (feeResponse.ok) {
          const feeData = await feeResponse.json();
          finalFeeRate = feeData.economyFee || 10; // Use economy fee
        }
      } catch (error) {
        console.error('Error fetching fee rate, using default:', error);
      }
    }

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
        ${bitcoinAmount.toFixed(8)},
        ${PAYMENT_ADDRESS},
        ${expiresAt.toISOString()},
        NULL,
        0
      )
      RETURNING id, payment_address, bitcoin_amount, expires_at, created_at
    ` as any[];

    const payment = Array.isArray(result) && result.length > 0 ? result[0] : null;
    if (!payment) {
      return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 });
    }

    // Return PSBT creation data
    // The frontend can create the PSBT using any Bitcoin wallet
    return NextResponse.json({
      paymentId: payment.id,
      paymentAddress: payment.payment_address,
      bitcoinAmount: payment.bitcoin_amount,
      bitcoinAmountSats: bitcoinAmountSats,
      creditsAmount: tier.credits,
      expiresAt: payment.expires_at,
      feeRate: finalFeeRate,
      // Instructions for frontend to create PSBT
      instructions: {
        recipientAddress: PAYMENT_ADDRESS,
        amountSats: bitcoinAmountSats,
        feeRate: finalFeeRate,
      }
    });
  } catch (error: any) {
    console.error('Error creating payment PSBT:', error);
    return NextResponse.json({ 
      error: error?.message || 'Failed to create payment' 
    }, { status: 500 });
  }
}

