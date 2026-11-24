// Declarative "secondary" pages (Guest Network, DDNS, QoS, LAG …) for the router and switch.
// Their values are kept in state.extra[pageId] so they survive navigation, but no checker uses them.
import { useState, type FormEvent, type ReactNode } from 'react'
import { Actions, CheckRow, DataTable, MsgBox, Panel, PlHint, RadioRow, Row, SelectRow, TextRow, useMsg } from './shell'
import { isIp, normalizeMac } from './ip'

export type FieldValue = string | boolean
export type Values = Record<string, FieldValue>

export type Field =
  | {
      k: string
      label: string
      type: 'text' | 'password'
      def?: string
      hint?: ReactNode
      suffix?: string
      valid?: 'ip' | 'ip-opt' | 'mac' | 'port' | 'port-opt' | 'nonempty' | [number, number]
      maxLength?: number
      when?: (v: Values) => boolean
    }
  | { k: string; label: string; type: 'select'; options: readonly (readonly [string, string])[]; def?: string; hint?: ReactNode; when?: (v: Values) => boolean }
  | { k: string; label: string; type: 'radio'; options: readonly (readonly [string, string])[]; def?: string; hint?: ReactNode; vertical?: boolean; when?: (v: Values) => boolean }
  | { k: string; label: string; type: 'check'; text: string; def?: boolean; hint?: ReactNode; when?: (v: Values) => boolean }
  | { k: string; label: string; type: 'static'; value: ReactNode | ((v: Values) => ReactNode); when?: (v: Values) => boolean }

export interface FormSpec {
  title: string
  fields: Field[]
  /** Save / Apply */
  button: string
  /** extra (no-op) buttons, e.g. 'Clear All' */
  more?: string[]
  intro?: ReactNode
  pl?: ReactNode
  after?: (v: Values) => ReactNode
  okText?: string
}

function defaults(fields: Field[]): Values {
  const v: Values = {}
  for (const f of fields) {
    if (f.type === 'static') continue
    if (f.type === 'check') v[f.k] = f.def ?? false
    else if (f.type === 'select' || f.type === 'radio') v[f.k] = f.def ?? f.options[0]?.[0] ?? ''
    else v[f.k] = f.def ?? ''
  }
  return v
}

function validate(fields: Field[], v: Values): string {
  for (const f of fields) {
    if ((f.type !== 'text' && f.type !== 'password') || !f.valid) continue
    if (f.when && !f.when(v)) continue
    const s = String(v[f.k] ?? '').trim()
    const bad = `Invalid ${f.label.toLowerCase()}, please input another one.`
    if (f.valid === 'nonempty' && s === '') return `Please enter the ${f.label.toLowerCase()}.`
    if (f.valid === 'ip' && !isIp(s)) return bad
    if (f.valid === 'ip-opt' && s !== '' && !isIp(s)) return bad
    if (f.valid === 'mac' && !normalizeMac(s)) return 'Invalid MAC address. Use the format XX-XX-XX-XX-XX-XX.'
    if ((f.valid === 'port' || (f.valid === 'port-opt' && s !== '')) && !/^\d{1,5}(-\d{1,5})?$/.test(s)) return bad
    if (Array.isArray(f.valid)) {
      const n = Number(s)
      if (!/^\d+$/.test(s) || n < f.valid[0] || n > f.valid[1])
        return `${f.label} must be between ${f.valid[0]} and ${f.valid[1]}.`
    }
  }
  return ''
}

function FieldView({ f, v, set, idp }: { f: Field; v: Values; set: (k: string, x: FieldValue) => void; idp: string }) {
  if (f.when && !f.when(v)) return null
  const id = `${idp}-${f.k}`
  switch (f.type) {
    case 'static':
      return (
        <Row label={f.label}>
          <span className="dv-static">{typeof f.value === 'function' ? f.value(v) : f.value}</span>
        </Row>
      )
    case 'check':
      return <CheckRow id={id} label={f.label} text={f.text} checked={!!v[f.k]} onChange={(x) => set(f.k, x)} hint={f.hint} />
    case 'select':
      return (
        <SelectRow id={id} label={f.label} value={String(v[f.k])} options={f.options} onChange={(x) => set(f.k, x)} hint={f.hint} />
      )
    case 'radio':
      return (
        <RadioRow
          name={id}
          label={f.label}
          value={String(v[f.k])}
          options={f.options}
          onChange={(x) => set(f.k, x)}
          hint={f.hint}
          vertical={f.vertical}
        />
      )
    default:
      return (
        <TextRow
          id={id}
          label={f.label}
          type={f.type}
          value={String(v[f.k] ?? '')}
          onChange={(x) => set(f.k, x)}
          hint={f.hint}
          suffix={f.suffix}
          maxLength={f.maxLength}
          inputMode={f.valid === 'ip' || f.valid === 'ip-opt' ? 'decimal' : Array.isArray(f.valid) || f.valid === 'port' ? 'numeric' : undefined}
        />
      )
  }
}

export function GenericForm(props: {
  pageId: string
  idPrefix: string
  spec: FormSpec
  stored: unknown
  onSave: (v: Values) => void
}) {
  const { spec } = props
  const [v, setV] = useState<Values>(() => ({ ...defaults(spec.fields), ...((props.stored as Values) ?? {}) }))
  const [msg, setMsg] = useMsg()
  const set = (k: string, x: FieldValue) => setV((o) => ({ ...o, [k]: x }))
  const save = (e: FormEvent) => {
    e.preventDefault()
    const err = validate(spec.fields, v)
    if (err) return setMsg({ kind: 'err', text: err })
    props.onSave(v)
    setMsg({ kind: 'ok', text: spec.okText ?? 'Settings saved successfully.' })
  }
  const idp = `${props.idPrefix}-${props.pageId}`
  return (
    <form onSubmit={save} noValidate>
      <Panel title={spec.title}>
        {spec.intro ? <p className="dv-intro">{spec.intro}</p> : null}
        {spec.fields.map((f) => (
          <FieldView key={f.k} f={f} v={v} set={set} idp={idp} />
        ))}
        <MsgBox msg={msg} />
        <Actions>
          <button type="submit" className="dv-btn">
            {spec.button}
          </button>
          {(spec.more ?? []).map((b) => (
            <button
              key={b}
              type="button"
              className="dv-btn dv-btn-2"
              onClick={() => {
                if (/clear/i.test(b)) setV(defaults(spec.fields))
                else setMsg({ kind: 'info', text: `${b}: done.` })
              }}
            >
              {b}
            </button>
          ))}
        </Actions>
        {spec.after ? spec.after(v) : null}
        {spec.pl ? <PlHint>{spec.pl}</PlHint> : null}
      </Panel>
    </form>
  )
}

export interface ListSpec {
  title: string
  /** title of the add/modify form */
  formTitle: string
  fields: Field[]
  /** keys of the columns shown in the table (label from the field) */
  columns: string[]
  intro?: ReactNode
  pl?: ReactNode
  max?: number
  top?: ReactNode
}

export function GenericList(props: {
  pageId: string
  idPrefix: string
  spec: ListSpec
  stored: unknown
  onSave: (rows: Values[]) => void
}) {
  const { spec } = props
  const rows = Array.isArray(props.stored) ? (props.stored as Values[]) : []
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [v, setV] = useState<Values>(() => defaults(spec.fields))
  const [msg, setMsg] = useMsg()
  const idp = `${props.idPrefix}-${props.pageId}`
  const label = (k: string) => spec.fields.find((f) => f.k === k)?.label ?? k
  const show = (f: Field | undefined, x: FieldValue | undefined): string => {
    if (!f) return String(x ?? '')
    if (f.type === 'select' || f.type === 'radio') return f.options.find(([o]) => o === x)?.[1] ?? String(x ?? '')
    if (f.type === 'check') return x ? 'Enabled' : 'Disabled'
    if (f.type === 'password') return '••••••'
    return String(x ?? '') || '—'
  }

  if (editing !== null) {
    const save = (e: FormEvent) => {
      e.preventDefault()
      const err = validate(spec.fields, v)
      if (err) return setMsg({ kind: 'err', text: err })
      const next = editing === 'new' ? [...rows, v] : rows.map((r, i) => (i === editing ? v : r))
      props.onSave(next)
      setEditing(null)
      setMsg({ kind: 'ok', text: 'Settings saved successfully.' })
    }
    return (
      <form onSubmit={save} noValidate>
        <Panel title={spec.formTitle}>
          {spec.fields.map((f) => (
            <FieldView key={f.k} f={f} v={v} set={(k, x) => setV((o) => ({ ...o, [k]: x }))} idp={idp} />
          ))}
          <MsgBox msg={msg} />
          <Actions>
            <button type="submit" className="dv-btn">
              Save
            </button>
            <button type="button" className="dv-btn dv-btn-2" onClick={() => setEditing(null)}>
              Back
            </button>
          </Actions>
        </Panel>
      </form>
    )
  }

  return (
    <Panel title={spec.title}>
      {spec.top}
      {spec.intro ? <p className="dv-intro">{spec.intro}</p> : null}
      <DataTable
        columns={['ID', ...spec.columns.map(label), 'Modify']}
        rows={rows.map((r, i) => ({
          key: String(i),
          cells: [
            i + 1,
            ...spec.columns.map((k) => show(spec.fields.find((f) => f.k === k), r[k])),
            <span key="m" className="dv-ops">
              <button
                type="button"
                className="dv-link"
                onClick={() => {
                  setV({ ...defaults(spec.fields), ...r })
                  setMsg(null)
                  setEditing(i)
                }}
              >
                Modify
              </button>
              <button
                type="button"
                className="dv-link"
                onClick={() => {
                  props.onSave(rows.filter((_, j) => j !== i))
                  setMsg({ kind: 'ok', text: 'The entry has been deleted.' })
                }}
              >
                Delete
              </button>
            </span>,
          ],
        }))}
      />
      <MsgBox msg={msg} />
      <Actions>
        <button
          type="button"
          className="dv-btn"
          onClick={() => {
            if (spec.max && rows.length >= spec.max)
              return setMsg({ kind: 'err', text: `The table is full (max. ${spec.max} entries).` })
            setV(defaults(spec.fields))
            setMsg(null)
            setEditing('new')
          }}
        >
          Add New…
        </button>
        <button
          type="button"
          className="dv-btn dv-btn-2"
          disabled={rows.length === 0}
          onClick={() => {
            props.onSave([])
            setMsg({ kind: 'ok', text: 'All entries have been deleted.' })
          }}
        >
          Delete All
        </button>
      </Actions>
      {spec.pl ? <PlHint>{spec.pl}</PlHint> : null}
    </Panel>
  )
}

export const ENABLE_DISABLE = [
  ['enable', 'Enable'],
  ['disable', 'Disable'],
] as const
export const DISABLE_ENABLE = [
  ['disable', 'Disable'],
  ['enable', 'Enable'],
] as const
