-- Synonymes métier pour la recherche de natures (données, pas de schéma).
insert into plans_prevention.vocabulary (term, equivalents) values
  ('fenetres', array['menuiserie','fenetre']),
  ('visiophonie', array['interphonie','acces','controle']),
  ('interphonie', array['interphonie','acces','controle']),
  ('stop', array['stationnement','marquage','parking']),
  ('volets', array['volet'])
on conflict (term) do update set equivalents = excluded.equivalents;
