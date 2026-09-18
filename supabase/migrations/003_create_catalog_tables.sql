-- Create risks and measures catalog tables

CREATE TABLE IF NOT EXISTS pp_risk_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) UNIQUE NOT NULL,
  description text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pp_measure_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) UNIQUE NOT NULL,
  description text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE pp_risk_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE pp_measure_catalog ENABLE ROW LEVEL SECURITY;

-- RLS Policies - allow all authenticated users to read, super admin to write
CREATE POLICY "risk_catalog_read" ON pp_risk_catalog
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "risk_catalog_write" ON pp_risk_catalog
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' = 'SUPER_ADMIN')
  WITH CHECK (auth.jwt() ->> 'role' = 'SUPER_ADMIN');

CREATE POLICY "measure_catalog_read" ON pp_measure_catalog
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "measure_catalog_write" ON pp_measure_catalog
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' = 'SUPER_ADMIN')
  WITH CHECK (auth.jwt() ->> 'role' = 'SUPER_ADMIN');
