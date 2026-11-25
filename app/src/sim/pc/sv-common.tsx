// Small controls shared by the Windows Server consoles (DNS, GPO, IIS).
import { useState, type ReactNode } from 'react'
import { Tabs } from './ui'

export { Btn, Chk, Field, type Node } from './apps-server-mmc'
export { SvModal } from './apps-server'

export const Radio = ({ name, on, onChange, children, disabled }: { name: string; on: boolean; onChange: () => void; children: ReactNode; disabled?: boolean }) => (
  <label className={`w-radio ${disabled ? 'dis' : ''}`}>
    <input type="radio" name={name} checked={on} disabled={disabled} onChange={onChange} />
    <span>{children}</span>
  </label>
)

export const Sel = ({ value, onChange, options, id }: { value: string; onChange: (v: string) => void; options: string[]; id?: string }) => (
  <select id={id} className="w-input" value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map((o) => (
      <option key={o}>{o}</option>
    ))}
  </select>
)

/** a selectable list box (single selection) */
export function ListBox({ items, sel, onSel, height = 110 }: { items: string[]; sel: string | null; onSel: (i: string) => void; height?: number }) {
  return (
    <div className="sv-lb" style={{ height }} role="listbox">
      {items.map((i) => (
        <div key={i} role="option" aria-selected={sel === i} className={sel === i ? 'on' : ''} onClick={() => onSel(i)}>
          {i}
        </div>
      ))}
    </div>
  )
}

/** a window-like page container with tabs inside a modal */
export function TabbedBody({ tabs, children }: { tabs: string[]; children: (i: number) => ReactNode }) {
  const [i, setI] = useState(0)
  return (
    <>
      <Tabs tabs={tabs} cur={i} onChange={setI} />
      <div className="sv-tabpage">{children(i)}</div>
    </>
  )
}

export const OkCancel = ({ onOk, onCancel, okLabel = 'OK', cancelLabel = 'Anuluj', disabled }: { onOk: () => void; onCancel: () => void; okLabel?: string; cancelLabel?: string; disabled?: boolean }) => (
  <>
    <button className="w-btn primary" onClick={onOk} disabled={disabled}>
      {okLabel}
    </button>
    <button className="w-btn" onClick={onCancel}>
      {cancelLabel}
    </button>
  </>
)
