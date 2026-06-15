// Types reflétant le schéma Supabase (camelCase préservé entre guillemets en SQL).
// Volontairement partiels pour la Phase 0 — complétés au fil des phases.

export type Role =
  | 'admin'
  | 'commission'
  | 'enrol'
  | 'member'
  | 'resident'
  | 'validator'

export type CatType = 'academique' | 'spirituel'

export interface Book {
  id: number
  space_code: string
  titre: string
  auteur: string
  cat: string
  catType: CatType
  lang: string
  salle: string
  placard: string
  etagere: string
  annee: number | null
  expl: number
  emoji: string
  featured: boolean
  status: 'available' | 'borrowed' | 'retired' | 'missing'
  resume?: string
  editeur?: string
}

export interface User {
  id: number
  space_code: string
  abbrev: string
  prenom: string
  nom: string
  role: Role
  disabled: boolean
  canLoan?: boolean
  spiritualAccess?: boolean
  tabs?: string[]
  photoB64?: string | null
}

export interface SpaceConfig {
  space_code: string
  openAll: boolean
  catAccess: Record<Role, CatType[]>
  contact?: string
  contactName?: string
}

export interface Space {
  code: string
  name: string
  short: string
  active: boolean
  accentColor?: string | null
}
