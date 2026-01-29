-- Add payment tracking fields to pending_payments table
ALTER TABLE pending_payments
ADD COLUMN IF NOT EXISTS payment_txid TEXT;

ALTER TABLE pending_payments
ADD COLUMN IF NOT EXISTS confirmations INTEGER DEFAULT 0;

