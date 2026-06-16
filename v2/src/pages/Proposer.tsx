import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { useAuth } from '@/lib/auth'
import { useConfig } from '@/features/config/useConfig'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import { nextId } from '@/lib/counters'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export function Proposer() {
  const { user } = useAuth()
  const { data: config, isLoading } = useConfig()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [titre, setTitre] = useState('')
  const [auteur, setAuteur] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  if (!user) return null

  // Membre explicitement non autorisé à proposer
  if (user.role === 'member' && user.canPropose === false) {
    return (
      <div>
        <PageHeader title="Proposer un livre" back />
        <p className="px-6 py-16 text-center text-slate-500">
          Vous n'êtes pas autorisé à proposer des livres pour le moment.
        </p>
      </div>
    )
  }

  const now = new Date()
  const proposalsOpen =
    !!config?.openAll &&
    (!config.openUntil || now <= new Date(config.openUntil + 'T23:59:59'))

  // Écriture (à relire) — cf. addRq (app.js)
  async function submit() {
    if (!titre.trim()) {
      setErr('Le titre est obligatoire.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const id = await nextId('nxR')
      const entry = {
        id,
        space_code: SPACE_ID,
        titre: titre.trim(),
        auteur: auteur.trim(),
        desc: desc.trim(),
        motif: config?.propMotif ?? '',
        sessionId: config?.currentSessionId ?? null,
        dem: user!.id,
        status: 'pending',
        note: '',
        date: todayStr(),
      }
      const { error } = await supabase.from('book_requests').insert(entry)
      if (error) throw new Error(error.message)
      qc.invalidateQueries({ queryKey: ['requests', SPACE_ID] })
      setDone(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <div>
        <PageHeader title="Proposer un livre" back />
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="mb-3 text-5xl">✅</div>
          <p className="font-semibold text-slate-700">Proposition envoyée !</p>
          <p className="mt-1 text-sm text-slate-500">
            Votre demande a été transmise à la commission.
          </p>
          <button
            onClick={() => navigate('/catalogue')}
            className="mt-6 rounded-xl bg-navy px-6 py-3 font-semibold text-white"
          >
            Retour au catalogue
          </button>
        </div>
      </div>
    )

  return (
    <div>
      <PageHeader title="Proposer un livre" back />
      <div className="px-4 py-4">
        {isLoading && <p className="py-10 text-center text-slate-400">Chargement…</p>}

        {!isLoading && !proposalsOpen && (
          <div className="rounded-xl bg-amber-50 p-4 text-center text-sm text-amber-700">
            📕 Les propositions de livres sont actuellement <strong>fermées</strong>.
            Revenez quand une session sera ouverte par la commission.
          </div>
        )}

        {!isLoading && proposalsOpen && (
          <div className="space-y-3">
            {config?.propMotif && (
              <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-700">
                🎯 Thème de la session : <strong>{config.propMotif}</strong>
              </div>
            )}
            <Field label="Titre du livre *" value={titre} onChange={setTitre} />
            <Field label="Auteur" value={auteur} onChange={setAuteur} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Description / justification
              </span>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[15px] focus:border-navy focus:outline-none"
              />
            </label>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button
              onClick={submit}
              disabled={busy}
              className="w-full rounded-xl bg-comoe py-3.5 font-semibold text-white active:opacity-90 disabled:opacity-60"
            >
              {busy ? 'Envoi…' : 'Envoyer la proposition'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[15px] focus:border-navy focus:outline-none"
      />
    </label>
  )
}
