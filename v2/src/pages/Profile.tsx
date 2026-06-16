import { useRef, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { useAuth } from '@/lib/auth'
import { ROLE_LABEL } from '@/lib/capabilities'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import { fileToCompressedDataUrl } from '@/lib/image'
import type { User } from '@/lib/types'

export function Profile() {
  const { user, logout, updateUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    whatsapp: '',
    commune: '',
    profession: '',
    prenom: '',
    nom: '',
    email: '',
  })

  if (!user) return null
  const isResident = user.role === 'resident'
  const initials = ((user.prenom[0] || '') + (user.nom[0] || '')).toUpperCase()

  function startEdit() {
    setForm({
      whatsapp: user!.whatsapp ?? '',
      commune: user!.commune ?? '',
      profession: user!.profession ?? '',
      prenom: user!.prenom ?? '',
      nom: user!.nom ?? '',
      email: user!.email ?? '',
    })
    setPhoto(user!.photoB64 ?? null)
    setErr('')
    setEditing(true)
  }

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setPhoto(await fileToCompressedDataUrl(file))
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Image invalide.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Écriture (à relire) — cf. saveMyProfile (app.js)
  async function save() {
    setErr('')
    const updates: Record<string, string | null> = {
      whatsapp: form.whatsapp.trim() || null,
      commune: form.commune.trim() || null,
      profession: form.profession.trim() || null,
      photoB64: photo,
    }
    if (isResident) {
      if (!form.prenom.trim() || !form.nom.trim()) {
        setErr('Prénom et nom obligatoires.')
        return
      }
      updates.prenom = form.prenom.trim()
      updates.nom = form.nom.trim()
      updates.email = form.email.trim() || null
    }
    setBusy(true)
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user!.id)
      .eq('space_code', SPACE_ID)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    updateUser(updates as Partial<User>)
    setEditing(false)
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div>
      <PageHeader title="Mon profil" />
      <div className="px-4 py-5">
        <div className="flex flex-col items-center rounded-2xl bg-white p-6 shadow-card">
          {user.photoB64 ? (
            <img
              src={user.photoB64}
              alt={`${user.prenom} ${user.nom}`}
              className="h-24 w-24 rounded-full object-cover ring-2 ring-navy/10"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-navy text-2xl font-bold text-white">
              {initials || '?'}
            </div>
          )}
          <h2 className="mt-3 font-serif text-2xl font-semibold text-navy">
            {user.prenom} {user.nom}
          </h2>
          <span className="mt-1 rounded-full bg-slate-100 px-3 py-0.5 text-xs font-semibold text-slate-600">
            {ROLE_LABEL[user.role] ?? user.role}
          </span>
        </div>

        {!editing ? (
          <>
            <dl className="mt-4 divide-y divide-slate-100 rounded-2xl bg-white shadow-card">
              <Row label="Code de connexion" value={user.abbrev} />
              <Row label="WhatsApp" value={user.whatsapp} />
              <Row label="Commune" value={user.commune} />
              <Row label="Profession" value={user.profession} />
              <Row label="E-mail" value={user.email} />
            </dl>
            <button
              onClick={startEdit}
              className="mt-4 w-full rounded-xl bg-navy py-3 font-semibold text-white active:opacity-90"
            >
              ✏️ Modifier mes informations
            </button>
          </>
        ) : (
          <div className="mt-4 space-y-3 rounded-2xl bg-white p-4 shadow-card">
            {/* Photo de profil */}
            <div className="flex flex-col items-center gap-2 pb-1">
              {photo ? (
                <img src={photo} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-navy/10" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-navy text-xl font-bold text-white">
                  {initials || '?'}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  📷 {photo ? 'Changer' : 'Ajouter une photo'}
                </button>
                {photo && (
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600"
                  >
                    Retirer
                  </button>
                )}
              </div>
            </div>
            {isResident && (
              <>
                <Field label="Prénom" value={form.prenom} onChange={set('prenom')} />
                <Field label="Nom" value={form.nom} onChange={set('nom')} />
                <Field label="E-mail" value={form.email} onChange={set('email')} type="email" />
              </>
            )}
            <Field label="WhatsApp" value={form.whatsapp} onChange={set('whatsapp')} type="tel" />
            <Field label="Commune" value={form.commune} onChange={set('commune')} />
            <Field label="Profession" value={form.profession} onChange={set('profession')} />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 rounded-xl bg-slate-100 py-3 font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="flex-1 rounded-xl bg-navy py-3 font-semibold text-white disabled:opacity-60"
              >
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-3.5 font-semibold text-red-600 active:bg-red-100"
        >
          🚪 Déconnexion
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value || '—'}</dd>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[15px] focus:border-navy focus:outline-none"
      />
    </label>
  )
}
