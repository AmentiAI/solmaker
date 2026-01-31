-- Migration 115: Create candy_machine_deployments table

CREATE TABLE IF NOT EXISTS candy_machine_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  
  -- Deployment steps
  step TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  
  -- Transaction info
  tx_signature TEXT,
  error_message TEXT,
  
  -- Data
  step_data JSONB,
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT valid_step_status CHECK (status IN (
    'pending', 'in_progress', 'completed', 'failed'
  ))
);

CREATE INDEX IF NOT EXISTS idx_cm_deployments_collection ON candy_machine_deployments(collection_id);
CREATE INDEX IF NOT EXISTS idx_cm_deployments_status ON candy_machine_deployments(status);
CREATE INDEX IF NOT EXISTS idx_cm_deployments_started ON candy_machine_deployments(started_at DESC);

COMMENT ON TABLE candy_machine_deployments IS 'Tracks Candy Machine deployment steps and progress';
COMMENT ON COLUMN candy_machine_deployments.step IS 'Deployment step: upload_metadata, create_collection_nft, create_candy_machine, add_config_lines, configure_guards';
COMMENT ON COLUMN candy_machine_deployments.step_data IS 'JSON data for each deployment step';
