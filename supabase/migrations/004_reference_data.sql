-- Bootstrap risks and measures from reference data

-- Insert Risks (14 total)
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R01', 'Amiante/plomb: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R02', 'Coupure/sectionnement: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R03', 'Vibration: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R04', 'Bruit: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R05', 'Heurt: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R06', 'Risque électrique: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R07', 'Chute de hauteur: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R08', 'Incendie/explosion: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R09', 'Risque routier: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R10', 'Chute de plain-pied: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R11', 'Troubles musculosquelettiques: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R12', 'Forte chaleur: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R13', 'Chute d’objet: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_risks_catalog (code, description, active) VALUES ('R14', 'Produit chimique: Risque initial issu du modèle Excel; à préciser dans le contexte chantier.', true) ON CONFLICT (code) DO NOTHING;

-- Insert Measures (21 total)
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M01', 'Gants', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M02', 'Protection des trémies et ouvertures', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M03', 'Matériel électrique conforme et vérifié', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M04', 'Vêtements haute visibilité', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M05', 'Eclairage suffisant du chantier', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M06', 'Procédure de travail en hauteur sécurisée', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M07', 'Protection auditive', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M08', 'Rangement et nettoyage régulier', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M09', 'Permis feu si travail par flamme (soudure, meulage)', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M10', 'Lunettes / visière de protection', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M11', 'Stockage sécurisé des matériaux / produit dangereux', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M12', 'Plan de prévention amiantes / plomb', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M13', 'Harnais antichute', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M14', 'Extincteurs disponibles et vérifiés', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M15', 'Trousse de premiers secours sur place', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M16', 'Masque', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M17', 'Protection des câbles', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M18', 'Personnel formés aux gestes de premiers secours', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M19', 'Tenue de protection', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M20', 'Temps de pause lors de tâches pénibles', true) ON CONFLICT (code) DO NOTHING;
INSERT INTO pp_measures_catalog (code, description, active) VALUES ('M21', 'Pauses fraicheurs (hydratation)', true) ON CONFLICT (code) DO NOTHING;

-- Insert Default Scope Rules
INSERT INTO pp_command_scope_rules (name, description, active) VALUES ('Budget Actif', 'Commandes avec budget actif (GT, GE, CP)', true) ON CONFLICT (name) DO NOTHING;
INSERT INTO pp_command_scope_rule_values (rule_id, value) SELECT id, 'GT' FROM pp_command_scope_rules WHERE name = 'Budget Actif' ON CONFLICT DO NOTHING;
INSERT INTO pp_command_scope_rule_values (rule_id, value) SELECT id, 'GE' FROM pp_command_scope_rules WHERE name = 'Budget Actif' ON CONFLICT DO NOTHING;
INSERT INTO pp_command_scope_rule_values (rule_id, value) SELECT id, 'CP' FROM pp_command_scope_rules WHERE name = 'Budget Actif' ON CONFLICT DO NOTHING;
