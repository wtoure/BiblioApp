import { PageHeader } from '@/components/PageHeader'

interface Props {
  title: string
  phase: string
}

/** Page provisoire — sera remplacée par la vraie implémentation de la phase indiquée. */
export function Placeholder({ title, phase }: Props) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-4 text-5xl">🚧</div>
        <p className="font-semibold text-slate-700">Section en construction</p>
        <p className="mt-1 max-w-xs text-sm text-slate-500">
          Cette section sera disponible lors de la <strong>{phase}</strong> de la migration v2.
        </p>
      </div>
    </div>
  )
}
