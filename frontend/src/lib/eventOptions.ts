export const FACILITY_OPTIONS = [
  'Sala principală',
  'Camere copii',
  'Sala tineret',
  'Spațiu exterior',
  'Acces bucătărie',
  'Sistem de sunet',
  'Proiectoare',
  'Echipament lumini',
  'Mese și scaune',
  'Transport',
]

export const EVENT_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'published'] as const

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Ciornă',
  submitted: 'Trimis',
  under_review: 'În analiză',
  approved: 'Aprobat',
  rejected: 'Respins',
  published: 'Publicat',
}

export const statusBadge = (s: string) =>
  s === 'published' || s === 'approved'
    ? 'bg-primary/10 text-primary'
    : s === 'rejected'
    ? 'bg-destructive/10 text-destructive'
    : s === 'under_review' || s === 'submitted'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-secondary text-secondary-foreground'
