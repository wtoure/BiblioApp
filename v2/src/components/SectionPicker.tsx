export interface Section {
  key: string
  label: string
}

interface Props {
  sections: Section[]
  value: string
  onChange: (key: string) => void
}

/**
 * Sélecteur de section : <select> natif → tap 100% fiable sur mobile,
 * aucun conflit défilement/clic (la leçon retenue de la v1).
 */
export function SectionPicker({ sections, value, onChange }: Props) {
  return (
    <div className="sticky top-[52px] z-20 bg-slate-100 px-3 py-2">
      <select
        aria-label="Choisir une section"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border-[1.5px] border-slate-200 bg-white px-4 py-3 pr-10 text-[15px] font-bold text-navy shadow-card focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%231C4370' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 15px center',
        }}
      >
        {sections.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  )
}
