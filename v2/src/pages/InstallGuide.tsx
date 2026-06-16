import { useMemo } from 'react'
import { PageHeader } from '@/components/PageHeader'

type Platform = 'ios' | 'android' | 'other'

function detectPlatform(): Platform {
  const ua = navigator.userAgent || ''
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

export function InstallGuide() {
  const platform = useMemo(detectPlatform, [])

  return (
    <div>
      <PageHeader title="Installer l'application" />
      <div className="px-4 py-4">
        <div className="rounded-2xl bg-gradient-to-br from-navy to-navy-light p-5 text-white shadow-soft">
          <div className="text-3xl">📲</div>
          <h2 className="mt-2 text-lg font-bold">Ajoutez ComoéBiblio à votre écran d'accueil</h2>
          <p className="mt-1 text-sm text-white/85">
            L'application s'ouvrira en plein écran, comme une vraie appli — sans passer par le navigateur.
          </p>
        </div>

        {platform === 'ios' && <IosSteps />}
        {platform === 'android' && <AndroidSteps />}
        {platform === 'other' && (
          <>
            <p className="mt-4 text-sm text-slate-500">
              Choisissez votre téléphone :
            </p>
            <IosSteps />
            <AndroidSteps />
          </>
        )}

        <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-relaxed text-blue-700">
          💡 Une fois installée, ouvrez l'appli depuis son icône 📚 sur votre écran d'accueil.
          Vous resterez connecté.
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl bg-white p-4 shadow-card">
      <h3 className="mb-2 font-semibold text-navy">{title}</h3>
      <ol className="space-y-2.5">{children}</ol>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
        {n}
      </span>
      <span className="text-[15px] leading-relaxed text-slate-700">{children}</span>
    </li>
  )
}

function IosSteps() {
  return (
    <Card title="📱 iPhone / iPad (Safari)">
      <Step n={1}>
        Ouvrez l'application dans <strong>Safari</strong> (le navigateur d'Apple).
      </Step>
      <Step n={2}>
        Touchez le bouton <strong>Partager</strong> en bas de l'écran (le carré avec une flèche ⬆️).
      </Step>
      <Step n={3}>
        Faites défiler et touchez <strong>« Sur l'écran d'accueil »</strong>.
      </Step>
      <Step n={4}>
        Touchez <strong>« Ajouter »</strong> en haut à droite. L'icône 📚 apparaît sur votre écran.
      </Step>
    </Card>
  )
}

function AndroidSteps() {
  return (
    <Card title="🤖 Android (Chrome)">
      <Step n={1}>
        Ouvrez l'application dans <strong>Chrome</strong>.
      </Step>
      <Step n={2}>
        Touchez le menu <strong>⋮</strong> en haut à droite.
      </Step>
      <Step n={3}>
        Touchez <strong>« Installer l'application »</strong> (ou « Ajouter à l'écran d'accueil »).
      </Step>
      <Step n={4}>
        Confirmez avec <strong>« Installer »</strong>. L'icône 📚 apparaît sur votre écran.
      </Step>
    </Card>
  )
}
