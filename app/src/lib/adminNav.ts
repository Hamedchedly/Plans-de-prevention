/** Pages de l'administration, regroupées sur deux niveaux (groupe > page). Source unique pour la barre latérale et la page. */
export type AdminPageKey =
  | 'import' | 'donnees' | 'perimetre' | 'referentiels' | 'entreprises'
  | 'alertes' | 'validations' | 'tracabilite'
  | 'modeles' | 'fichiers' | 'utilisateurs'

export type AdminPage = { key: AdminPageKey; label: string; superOnly: boolean }
export type AdminGroup = { label: string; pages: AdminPage[] }

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    label: 'Données',
    pages: [
      { key: 'import', label: 'Import Excel', superOnly: false },
      { key: 'donnees', label: 'Base de données', superOnly: true },
      { key: 'perimetre', label: 'Périmètre', superOnly: true },
      { key: 'referentiels', label: 'Référentiels', superOnly: true },
      { key: 'entreprises', label: 'Entreprises', superOnly: true },
    ],
  },
  {
    label: 'Contrôle',
    pages: [
      { key: 'alertes', label: 'Alertes', superOnly: false },
      { key: 'validations', label: 'Validations', superOnly: true },
      { key: 'tracabilite', label: 'Traçabilité', superOnly: true },
    ],
  },
  {
    label: 'Paramétrage',
    pages: [
      { key: 'modeles', label: 'Modèles mail et PDF', superOnly: true },
      { key: 'fichiers', label: 'Fichiers de fiches', superOnly: true },
      { key: 'utilisateurs', label: 'Utilisateurs et chargés', superOnly: false },
    ],
  },
]

/** Groupes et pages visibles pour un rôle (les pages « super admin » sont masquées aux responsables). */
export function visibleAdminGroups(isSuper: boolean): AdminGroup[] {
  return ADMIN_GROUPS
    .map((g) => ({ ...g, pages: g.pages.filter((p) => !p.superOnly || isSuper) }))
    .filter((g) => g.pages.length > 0)
}

export function isAdminPageKey(s: string): s is AdminPageKey {
  return ADMIN_GROUPS.some((g) => g.pages.some((p) => p.key === s))
}

export function adminPageLabel(key: string): string {
  return ADMIN_GROUPS.flatMap((g) => g.pages).find((p) => p.key === key)?.label ?? 'Administration'
}
