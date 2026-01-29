# Transaction Tracking System

## How Transactions Are Tracked

### 1. Payment Initiation
- When a user initiates a credit purchase, a record is created in the `pending_payments` table
- Fields tracked:
  - `wallet_address`: User's wallet address
  - `credits_amount`: Number of credits being purchased
  - `bitcoin_amount`: BTC amount required
  - `payment_address`: Fixed address 
  - `status`: Initially 'pending'
  - `payment_txid`: NULL until payment is detected
  - `confirmations`: 0 until transaction is confirmed
  - `created_at`: Timestamp when payment was initiated
  - `expires_at`: Payment expiration (1 hour from creation)

### 2. Blockchain Verification
- System checks Mempool.space API for transactions to the payment address
- When a transaction is found:
  - `payment_txid` is recorded
  - `confirmations` count is updated
  - `status` changes to 'completed' when confirmed

### 3. Credit Awarding
- When payment is confirmed, credits are added via `credit_transactions` table
- Fields tracked:
  - `wallet_address`: User's wallet
  - `amount`: Positive for purchases, negative for usage
  - `transaction_type`: 'purchase' or 'usage'
  - `description`: Human-readable description
  - `payment_txid`: Links to the Bitcoin transaction
  - `created_at`: When credits were awarded

### 4. Admin Dashboard
- Shows only **real transactions**:
  - Completed payments with TXID (blockchain verified)
  - Active pending payments (not expired)
  - Pending payments with TXID (real transactions in progress)
- Excludes:
  - Expired unpaid attempts (no TXID, expired)
  - Test data

## Database Tables

### `pending_payments`
Tracks all payment attempts and their status on the blockchain.

### `credit_transactions`
Tracks all credit additions and deductions (real activity only).

### `credits`
Current credit balance per wallet address.

## Verification Process

1. User creates payment request → `pending_payments` record created
2. User sends Bitcoin → Transaction appears on blockchain
3. System polls Mempool API → Detects transaction
4. Transaction confirmed → `status` = 'completed', `payment_txid` set
5. Credits awarded → `credit_transactions` record created
6. Balance updated → `credits` table updated

All data shown in admin is **real, blockchain-verified transactions only**.

