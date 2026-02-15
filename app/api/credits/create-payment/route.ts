import { NextRequest, NextResponse } from 'next/server';
import { CREDIT_TIERS } from '@/lib/credits/constants';
import { sql } from '@/lib/database';
import { checkHolderStatus } from '@/lib/holder-check';
import { getPlatformWalletAddress } from '@/lib/solana/platform-wallet';
import { getClusterAsync } from '@/lib/solana/connection';

// Payment addresses
const BTC_PAYMENT_ADDRESS = process.env.FEE_WALLET || 'bc1p693zz6n9cvmsewemg4j0pmvfvs4th3ft9c74afrc90l6sah300uqt99vee' // Legacy Bitcoin
const ETH_PAYMENT_ADDRESS = process.env.ETH_PAYMENT_ADDRESS || '0x5CA2e4B034d2F37D66C6d546F14a52651726118A';

// Get Solana payment address (may be null during build)
function getSolPaymentAddress(): string {
  const address = getPlatformWalletAddress()
  if (!address) {
    throw new Error('Solana payment address not configured')
  }
  return address
}

// Fetch exchange rate from CoinGecko
async function fetchExchangeRate(coinId: string): Promise<number> {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    return data[coinId]?.usd || 0;
  } catch (error) {
    console.error(`Error fetching ${coinId} price:`, error);
    return 0;
  }
}

// POST /api/credits/create-payment - Create a payment for credit purchase (supports BTC, ETH, SOL)
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { wallet_address, tier_index, fee_rate, payment_type = 'btc', holder_discount = 0 } = body;

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    if (tier_index === undefined || tier_index < 0 || tier_index >= CREDIT_TIERS.length) {
      return NextResponse.json({ error: 'Invalid tier index' }, { status: 400 });
    }

    if (!['btc', 'eth', 'sol'].includes(payment_type)) {
      return NextResponse.json({ error: 'Invalid payment type. Must be btc, eth, or sol' }, { status: 400 });
    }

    const tier = CREDIT_TIERS[tier_index];
    
    // Apply holder discount (validated on server-side)
    let discountMultiplier = 1;
    // Always check holder status server-side to validate discount
    try {
      const holderData = await checkHolderStatus(wallet_address);
      if (holderData.isHolder && holderData.discountPercent > 0) {
        discountMultiplier = 1 - (holderData.discountPercent / 100);
        console.log(`[Payment] Holder discount applied: ${holderData.discountPercent}% for ${wallet_address} (holds ${holderData.holdingCount} ${holderData.collection} ordinal(s))`);
      } else if (holder_discount > 0) {
        // Client claimed discount but server verification failed
        console.warn(`[Payment] Client claimed ${holder_discount}% discount but holder check failed for ${wallet_address}`);
      }
    } catch (err) {
      console.warn('[Payment] Could not verify holder discount, proceeding without discount:', err);
    }
    
    const usdAmount = tier.totalPrice * discountMultiplier;

    // Create pending payment (expires in 1 hour)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    let paymentAddress: string;
    let cryptoAmount: number;
    let bitcoinAmount: number; // Store in BTC equivalent for database compatibility
    let network: string;
    let responseData: any = {};

    if (payment_type === 'btc') {
      // Bitcoin payment
      paymentAddress = BTC_PAYMENT_ADDRESS;
      network = 'bitcoin';

      // Fetch BTC/USD rate
      let btcRate = await fetchExchangeRate('bitcoin');
      if (!btcRate || btcRate <= 0) {
        // Fallback to multiple APIs
        const apis = [
          'https://api.coinbase.com/v2/exchange-rates?currency=BTC',
          'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
          'https://api.coindesk.com/v1/bpi/currentprice/USD.json'
        ];
        
        for (const apiUrl of apis) {
          try {
            const response = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
            if (response.ok) {
              const data = await response.json();
              if (apiUrl.includes('coindesk')) {
                btcRate = parseFloat(data.bpi.USD.rate.replace(/,/g, ''));
              } else if (apiUrl.includes('coinbase')) {
                btcRate = parseFloat(data.data.rates.USD);
              } else if (apiUrl.includes('binance')) {
                btcRate = parseFloat(data.price);
              }
              if (btcRate > 0) break;
            }
          } catch (err) {
            continue;
          }
        }
      }

      if (!btcRate || btcRate <= 0) {
        btcRate = 40000; // Fallback
      }

      cryptoAmount = usdAmount / btcRate;
      bitcoinAmount = cryptoAmount;
      const bitcoinAmountSats = Math.ceil(cryptoAmount * 100000000);

      // Use provided fee rate or fetch current fee rate
      let finalFeeRate = fee_rate || 10;
      if (!fee_rate) {
        try {
          const feeResponse = await fetch('https://mempool.space/api/v1/fees/recommended', {
            signal: AbortSignal.timeout(5000),
          });
          if (feeResponse.ok) {
            const feeData = await feeResponse.json();
            finalFeeRate = feeData.economyFee || 10;
          }
        } catch (error) {
          console.error('Error fetching fee rate, using default:', error);
        }
      }

      responseData = {
        bitcoinAmountSats,
        feeRate: finalFeeRate,
        instructions: {
          recipientAddress: paymentAddress,
          amountSats: bitcoinAmountSats,
          feeRate: finalFeeRate,
        }
      };
    } else if (payment_type === 'eth') {
      // Ethereum payment
      paymentAddress = ETH_PAYMENT_ADDRESS;
      network = 'ethereum';

      // Fetch ETH/USD rate
      let ethRate = await fetchExchangeRate('ethereum');
      if (!ethRate || ethRate <= 0) {
        ethRate = 2500; // Fallback
      }

      cryptoAmount = usdAmount / ethRate;
      bitcoinAmount = cryptoAmount; // Store as BTC equivalent for DB compatibility

      responseData = {
        ethAmount: cryptoAmount,
      };
    } else if (payment_type === 'sol') {
      // Solana payment — store actual cluster (devnet/mainnet-beta) not just "solana"
      paymentAddress = getSolPaymentAddress();
      network = await getClusterAsync();

      // Fetch SOL/USD rate
      let solRate = await fetchExchangeRate('solana');
      if (!solRate || solRate <= 0) {
        solRate = 100; // Fallback
      }

      cryptoAmount = usdAmount / solRate;
      bitcoinAmount = cryptoAmount; // Store as BTC equivalent for DB compatibility

      responseData = {
        solAmount: cryptoAmount,
      };
    } else {
      // This should never happen due to validation above, but TypeScript needs this
      return NextResponse.json({ error: 'Invalid payment type' }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO pending_payments (
        wallet_address,
        credits_amount,
        bitcoin_amount,
        payment_address,
        expires_at,
        payment_txid,
        confirmations,
        payment_type,
        network
      )
      VALUES (
        ${wallet_address},
        ${tier.credits},
        ${bitcoinAmount.toFixed(8)},
        ${paymentAddress},
        ${expiresAt.toISOString()},
        NULL,
        0,
        ${payment_type},
        ${network}
      )
      RETURNING id, payment_address, bitcoin_amount, expires_at, created_at, payment_type, network
    ` as any[];

    const payment = Array.isArray(result) && result.length > 0 ? result[0] : null;
    if (!payment) {
      return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 });
    }

    return NextResponse.json({
      paymentId: payment.id,
      paymentAddress: payment.payment_address,
      bitcoinAmount: payment.bitcoin_amount,
      creditsAmount: tier.credits,
      expiresAt: payment.expires_at,
      paymentType: payment.payment_type,
      network: payment.network,
      ...responseData,
    });
  } catch (error: any) {
    console.error('Error creating payment:', error);
    return NextResponse.json({ 
      error: error?.message || 'Failed to create payment' 
    }, { status: 500 });
  }
}
