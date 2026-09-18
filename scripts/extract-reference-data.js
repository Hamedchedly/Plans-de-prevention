const XLSX = require('../app/node_modules/xlsx');
const fs = require('fs');
const path = require('path');

// Read Risks and Measures
const risksPath = path.join(__dirname, '../reference/REFERENTIEL_RISQUES_PLANS_PREVENTION.xlsx');
const risksWorkbook = XLSX.readFile(risksPath);

// Get sheet names
console.log('Sheet names:', risksWorkbook.SheetNames);

// Read Risks from RISQUES sheet
const risksSheet = risksWorkbook.Sheets['RISQUES'];
const risks = XLSX.utils.sheet_to_json(risksSheet);

// Read Measures from MESURES sheet
const measuresSheet = risksWorkbook.Sheets['MESURES'];
const measures = XLSX.utils.sheet_to_json(measuresSheet);

console.log('\n=== RISKS ===');
console.log('Sample risk:', risks[0]);
console.log('Total risks:', risks.length);

console.log('\n=== MEASURES ===');
console.log('Sample measure:', measures[0]);
console.log('Total measures:', measures.length);

// Generate SQL migration
let sql = `-- Bootstrap risks and measures from reference data\n\n`;

// Insert risks
sql += `-- Insert Risks (14 total)\n`;
risks.forEach((risk) => {
  const code = (risk['risk_id'] || '').replace(/'/g, "''");
  const libelle = (risk['libelle'] || '').replace(/'/g, "''");
  const description = (risk['description'] || '').replace(/'/g, "''");
  const active = risk['actif'] === true || risk['actif'] === 'true' || risk['actif'] === 1 ? 'true' : 'false';

  if (code) {
    sql += `INSERT INTO pp_risks_catalog (code, description, active) VALUES ('${code}', '${libelle}: ${description}', ${active}) ON CONFLICT (code) DO NOTHING;\n`;
  }
});

sql += `\n-- Insert Measures (21 total)\n`;
measures.forEach((measure) => {
  const code = (measure['measure_id'] || '').replace(/'/g, "''");
  const libelle = (measure['libelle'] || '').replace(/'/g, "''");
  const description = (measure['description'] || '').replace(/'/g, "''");
  const active = measure['actif'] === true || measure['actif'] === 'true' || measure['actif'] === 1 ? 'true' : 'false';

  if (code) {
    sql += `INSERT INTO pp_measures_catalog (code, description, active) VALUES ('${code}', '${libelle}', ${active}) ON CONFLICT (code) DO NOTHING;\n`;
  }
});

// Add scope rules
sql += `\n-- Insert Default Scope Rules\n`;
sql += `INSERT INTO pp_command_scope_rules (name, description, active) VALUES ('Budget Actif', 'Commandes avec budget actif (GT, GE, CP)', true) ON CONFLICT (name) DO NOTHING;\n`;
sql += `INSERT INTO pp_command_scope_rule_values (rule_id, value) SELECT id, 'GT' FROM pp_command_scope_rules WHERE name = 'Budget Actif' ON CONFLICT DO NOTHING;\n`;
sql += `INSERT INTO pp_command_scope_rule_values (rule_id, value) SELECT id, 'GE' FROM pp_command_scope_rules WHERE name = 'Budget Actif' ON CONFLICT DO NOTHING;\n`;
sql += `INSERT INTO pp_command_scope_rule_values (rule_id, value) SELECT id, 'CP' FROM pp_command_scope_rules WHERE name = 'Budget Actif' ON CONFLICT DO NOTHING;\n`;

// Write SQL to file
fs.writeFileSync(path.join(__dirname, '../supabase/migrations/004_reference_data.sql'), sql);
console.log('\nSQL migration written to supabase/migrations/004_reference_data.sql');

// Output JSON for verification
console.log('\n=== EXTRACTED DATA ===');
console.log(JSON.stringify({ risks: risks.slice(0, 3), measures: measures.slice(0, 3) }, null, 2));
