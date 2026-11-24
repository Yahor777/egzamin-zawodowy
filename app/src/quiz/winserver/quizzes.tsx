// Registry wrappers of the Windows Server / settings-path quizzes.
import { McqQuiz } from '../Mcq'
import { settingsCards } from './settings'
import { WinServerSteps } from './WinServerSteps'

export function WinServerStepsQuiz({ onDone }: { onDone: (pct: number) => void }) {
  return <WinServerSteps onDone={onDone} />
}

const make = (seed: number) => settingsCards(seed, 15)

export function SettingsPathQuiz({ onDone }: { onDone: (pct: number) => void }) {
  return (
    <McqQuiz
      seedKey="settings-path"
      title="Gdzie jest to ustawienie?"
      lead="Требование из листа CKE → путь в польском интерфейсе. 15 карточек, порог 70%."
      make={make}
      docs={[
        { to: 'practice/cheat-windows-client', section: '4. Локальные политики', title_ru: 'Шпаргалка: локальные политики' },
        { to: 'practice/cheat-windows-server', section: '9. GPO', title_ru: 'Шпаргалка: GPO' },
        { to: 'doc/winserver-roles', title_ru: 'Роли Windows Server' },
      ]}
      hint="Пароли, блокировка, аудит, права, Ctrl+Alt+Del при входе — Konfiguracja KOMPUTERA → Ustawienia zabezpieczeń (secpol). Запреты интерфейса (Panel sterowania, обои, regedit, cmd) — Konfiguracja UŻYTKOWNIKA → Szablony administracyjne. Флажки учётки, профиль, часы входа — в свойствах пользователя."
      onDone={onDone}
    />
  )
}
