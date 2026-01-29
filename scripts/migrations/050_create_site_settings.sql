-- Create site_settings table for site-wide configuration
CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(255) NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(setting_key);

-- Insert default settings
INSERT INTO site_settings (setting_key, setting_value, description)
VALUES 
  ('show_credit_purchase', 'true'::jsonb, 'Whether to show credit purchase functionality across the site')
ON CONFLICT (setting_key) DO NOTHING;

COMMENT ON TABLE site_settings IS 'Site-wide configuration settings';
COMMENT ON COLUMN site_settings.setting_key IS 'Unique key for the setting';
COMMENT ON COLUMN site_settings.setting_value IS 'JSON value for the setting (can be boolean, string, number, or object)';

