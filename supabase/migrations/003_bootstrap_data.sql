-- Plans de Prévention V6 - Bootstrap Data
-- Migration 003: Initial reference data and system configuration

-- Bootstrap Trades (from REFERENTIEL_CORPS_ETAT.xlsx)
insert into public.pp_trades (code, name, description, active) values
('0100', 'Aménagement logement', 'Aménagement des logements', true),
('0101', 'Maçonnerie', 'Travaux de maçonnerie générale', true),
('0102', 'Réfection voirie et abords', 'Réfection des voiries et abords', true),
('0103', 'Travaux divers, espaces extérieurs', 'Travaux divers sur espaces extérieurs', true),
('0201', 'Etanchéité terrasse, couverture', 'Travaux d''étanchéité toiture et couverture', true),
('0202', 'Etanchéité façade', 'Etanchéité des façades', true),
('0203', 'Isolation thermique', 'Travaux d''isolation thermique', true),
('0204', 'Fenêtre, vasistas', 'Remplacement fenêtres et vasistas', true),
('0301', 'Menuiserie', 'Travaux de menuiserie', true),
('0302', 'Serrurerie', 'Travaux de serrurerie', true),
('0303', 'Porte box', 'Portes de garage/box', true),
('0401', 'Revêtement de sol', 'Revêtement carrelage, parquets', true),
('0501', 'Gouttières, descentes EP', 'Gouttières et descentes eaux pluviales', true),
('0503', 'Plomberie', 'Travaux de plomberie', true),
('0601', 'Chauffage / désembouage / travaux associés', 'Chauffage et travaux associés', true),
('0802', 'Ascenseur', 'Travaux d''ascenseur', true),
('0804', 'Divers communs', 'Travaux divers parties communes', true),
('0828', 'Sécurité et vidéo surveillance', 'Sécurité et surveillance', true),
('0829', 'Honoraires', 'Honoraires et frais', true)
on conflict (code) do nothing;

-- Bootstrap Risk Catalog (from REFERENTIEL_RISQUES_PLANS_PREVENTION.xlsx)
insert into public.pp_risk_catalog (code, name, active) values
('CHUTE', 'Chute de hauteur', true),
('ELECTROCUTION', 'Électrocution', true),
('ASPHYXIE', 'Asphyxie/Intoxication', true),
('INCENDIE', 'Incendie/Explosion', true),
('COLLISION', 'Collision véhicule', true),
('BLESSURE', 'Blessure/Écrasement', true),
('BRUIT', 'Bruit/Vibrations', true),
('POUSSIERE', 'Poussière/Pollution', true),
('RAYONNEMENT', 'Rayonnement', true),
('CHIMIQUE', 'Produit chimique', true),
('BIOLOGIQUE', 'Biologique', true),
('THERMIQUE', 'Brûlure thermique', true),
('ERGONOMIQUE', 'Trouble musculo-squelettique', true),
('PSYCHOSOCIAL', 'Risque psychosocial', true)
on conflict (code) do nothing;

-- Bootstrap Measure Catalog (27 safety measures)
insert into public.pp_measure_catalog (code, name, active) values
('EPI_CASQUE', 'Port du casque obligatoire', true),
('EPI_HARNAIS', 'Harnais de sécurité obligatoire', true),
('EPI_GILET', 'Gilet de signalisation obligatoire', true),
('EPI_GANTS', 'Gants de protection obligatoires', true),
('EPI_CHAUSSURES', 'Chaussures de sécurité obligatoires', true),
('EPI_PROTEGE_TETE', 'Protection tête complète', true),
('BARRIERE', 'Mise en place de barrières', true),
('SIGNALISATION', 'Signalisation appropriée', true),
('ECLAIRAGE', 'Éclairage de secours', true),
('VENTILATION', 'Ventilation mécanique', true),
('EXTRACTION', 'Extraction/Aspiration', true),
('EQUIPEMENT_AUTONOME', 'Appareil respiratoire autonome', true),
('CONSIGNATION', 'Consignation/Cadenassage', true),
('ISOLATION', 'Isolation électrique', true),
('COUPURE_CIRCUIT', 'Mise en circuit court', true),
('TERRE_PROTECTION', 'Mise à la terre de protection', true),
('DISJONCTEUR_DIFFERENTIEL', 'Disjoncteur différentiel 30mA', true),
('CONTROLE_ELECTRIQUE', 'Contrôle régulier', true),
('EXTINCTION', 'Extincteurs disponibles', true),
('DETECTION', 'Détecteur de fumée', true),
('PLAN_EVACUATION', 'Plan d''évacuation affiché', true),
('SUPERVISION', 'Surveillance constante', true),
('LIMITATION_VITESSE', 'Limitation de vitesse', true),
('SIGNALEUR', 'Signaleur/Guetteur', true),
('PROTECTER_MACHINE', 'Protecteurs de machines', true),
('ARRET_URGENCE', 'Arrêt d''urgence accessible', true),
('FORMATION', 'Formation spécifique requise', true)
on conflict (code) do nothing;

-- Bootstrap Email Templates
insert into public.pp_email_templates (type, subject_template, body_template, version, active) values
('INITIAL_SEND',
  'Fiche de prévention - {{order.order_number}}',
  'Madame, Monsieur {{company.os_contact.last_name}},\n\nVeuillez trouver ci-joint la fiche de prévention pour les travaux {{order.work_nature}}.\n\nDate: {{plan.drafted_at}}\nChargé: {{user.full_name}}\n\nVeuillez valider ou corriger les informations.\n\nCordialement,\n{{user.full_name}}\n{{user.phone}}',
  1,
  true),
('RESEND',
  'Relance fiche de prévention - {{order.order_number}}',
  'Madame, Monsieur {{company.os_contact.last_name}},\n\nNous n''avons pas reçu de retour concernant la fiche de prévention du {{plan.drafted_at|date}}.\n\nVeuillez trouver ci-joint un exemplaire.\n\nMerci de votre diligence.\n\n{{user.full_name}}\n{{user.phone}}',
  1,
  true)
on conflict do nothing;

-- Bootstrap Plan Template (v1)
insert into public.pp_plan_templates (name, active) values
('Prevention Plan v1', true)
on conflict do nothing;

-- Get the inserted template ID and create a version
do $$
declare
  template_id uuid;
begin
  select id into template_id from public.pp_plan_templates where name = 'Prevention Plan v1' limit 1;

  insert into public.pp_plan_template_versions (template_id, version, status, definition_json, created_by)
  values (
    template_id,
    1,
    'PUBLISHED',
    jsonb_build_object(
      'blocks', jsonb_build_array(
        jsonb_build_object('id', 'header', 'type', 'SECTION', 'title', 'Fiche de Prévention'),
        jsonb_build_object('id', 'order_info', 'type', 'TEXT', 'content', 'Commande: {{order.order_number}}'),
        jsonb_build_object('id', 'company_info', 'type', 'TEXT', 'content', 'Entreprise: {{company.name}}'),
        jsonb_build_object('id', 'risks_section', 'type', 'SECTION', 'title', 'Risques identifiés'),
        jsonb_build_object('id', 'risks_table', 'type', 'RISK_TABLE'),
        jsonb_build_object('id', 'measures_section', 'type', 'SECTION', 'title', 'Mesures de prévention'),
        jsonb_build_object('id', 'measures_table', 'type', 'MEASURE_TABLE'),
        jsonb_build_object('id', 'signature_section', 'type', 'SECTION', 'title', 'Signatures'),
        jsonb_build_object('id', 'signature_block', 'type', 'SIGNATURE'),
        jsonb_build_object('id', 'date_block', 'type', 'TEXT', 'content', 'Date: {{plan.drafted_at}}')
      ),
      'version', 1
    ),
    null
  )
  on conflict do nothing;
end $$;
