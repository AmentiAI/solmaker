import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/finalize - Finalize a PSBT using Sandshrew API
 * 
 * This endpoint uses Sandshrew's finalizepsbt RPC method to finalize
 * PSBTs that were signed but not finalized by the wallet (e.g., Magic Eden)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { txBase64 } = body;

    if (!txBase64 || typeof txBase64 !== 'string') {
      return NextResponse.json(
        { error: 'txBase64 parameter is required' },
        { status: 400 }
      );
    }

    const SANDSHREW_API_URL = process.env.SANDSHREW_URL || "https://mainnet.sandshrew.io/v2";
    const SANDSHREW_DEVELOPER_KEY = process.env.SANDSHREW_DEVELOPER_KEY;

    if (!SANDSHREW_DEVELOPER_KEY) {
      return NextResponse.json(
        { error: 'SANDSHREW_DEVELOPER_KEY environment variable is not set' },
        { status: 500 }
      );
    }

    // Call Sandshrew finalizepsbt method
    const response = await fetch(`${SANDSHREW_API_URL}/${SANDSHREW_DEVELOPER_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `finalize-${Date.now()}`,
        method: 'finalizepsbt',
        params: [txBase64]
      }),
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Sandshrew finalize error:', errorText);
      return NextResponse.json(
        { error: `Failed to finalize PSBT: ${response.status} ${response.statusText}` },
        { status: 500 }
      );
    }

    const payload = await response.json();

    if (payload.error) {
      console.error('Sandshrew finalize RPC error:', payload.error);
      return NextResponse.json(
        { error: `Sandshrew finalize error: ${payload.error.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    const finalized = payload?.result;

    if (!finalized || !finalized.complete) {
      return NextResponse.json(
        { error: 'Transaction is not finalized. Missing signatures or invalid PSBT.' },
        { status: 400 }
      );
    }

    if (!finalized.hex) {
      return NextResponse.json(
        { error: 'Finalized transaction hex is missing' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      complete: true,
      hex: finalized.hex,
    });
  } catch (error: any) {
    console.error('Error finalizing PSBT:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to finalize PSBT' },
      { status: 500 }
    );
  }
}

