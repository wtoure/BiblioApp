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
  ancienNouv?: string
  etat?: string
  emoji: string
  featured: boolean
  status: 'available' | 'borrowed' | 'retired' | 'missing'
  resume?: string
  editeur?: string
  version?: number
  updatedAt?: string | null
  updatedBy?: string | null
  lastModifiedBy?: string | null
  lastModifiedAt?: string | null
  lastModifiedRole?: string | null
  addedAt?: string
}

export interface User {
  id: number
  space_code: string
  auth_id?: string | null
  abbrev: string
  prenom: string
  nom: string
  role: Role
  disabled: boolean
  canLoan?: boolean
  canPropose?: boolean
  spiritualAccess?: boolean
  tabs?: string[]
  photoB64?: string | null
  whatsapp?: string | null
  commune?: string | null
  profession?: string | null
  email?: string | null
  assignedShelves?: string[]
  neverExpires?: boolean
  expiresAt?: string | null
  propUntil?: string | null
}

export interface SpaceConfig {
  space_code: string
  openAll: boolean
  openUntil?: string | null
  propMotif?: string
  currentSessionId?: number | null
  catAccess: Record<Role, CatType[]>
  contact?: string | null
  contactName?: string | null
  meetingPlace?: string | null
  meetingTime?: string | null
  countryCode?: string | null
  shortLink?: string | null
  loanOpen?: boolean
  /** Durée (jours) d'affichage des livres mis en avant en tête de catalogue. 0/absent = illimité. */
  featuredDays?: number | null
}

export interface ShelfCheck {
  id: number
  space_code: string
  userId: number | null
  userName: string | null
  userRole: string | null
  shelfKey: string
  salle: string
  placard: string
  etagere: string
  checkedAt: string
  booksCount: number
  missingCount: number
  modifiedCount: number
}

export interface Space {
  code: string
  name: string
  short: string
  active: boolean
  accentColor?: string | null
}

export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface BookRequest {
  id: number
  space_code: string
  titre: string
  auteur: string
  desc: string
  motif: string
  sessionId: number | null
  dem: number | null
  status: RequestStatus
  note: string
  date: string
}

export interface RequestSession {
  id: number
  space_code: string
  motif: string
  openDate: string
  openUntil: string | null
  closed: boolean
  closedDate: string | null
}

export type LoanStatus = 'pending' | 'active' | 'pending_return' | 'returned' | 'rejected'

export interface Loan {
  id: string
  space_code: string
  bookId: number | null
  bookTitle: string
  userId: number | null
  userAbbrev: string | null
  userName: string | null
  status: LoanStatus
  dueDate: string
  requestedAt: string
  approvedAt?: string | null
  returnedAt?: string | null
}

export interface Registration {
  id: string
  space_code: string
  prenom: string
  nom: string
  whatsapp: string
  commune: string
  profession: string
  email?: string | null
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
  assignedRole?: string | null
  createdAbbrev?: string | null
  createdUserId?: number | null
  processedAt?: string | null
}
