import type { Lab } from '../labs/labs'
import { rng, TOPICS, type DrillDef, type DrillLab, type DrillTopic } from './kit'
import { LINUX_DRILLS } from './linux'
import { NET_DRILLS } from './net'
import { EXTRA_DRILLS } from './extra'
import { WS_DRILLS } from './winserver'
import { SHARE_DRILLS } from './winserver-shares'
import { WS_RRAS_DRILLS } from './winserver-rras'
import { WS_PRINT_DRILLS } from './winserver-print'

export { TOPICS, type DrillDef, type DrillLab, type DrillTopic }

export const DRILLS: DrillDef[] = [...LINUX_DRILLS, ...NET_DRILLS, ...EXTRA_DRILLS, ...WS_DRILLS, ...SHARE_DRILLS, ...WS_RRAS_DRILLS, ...WS_PRINT_DRILLS]

export const drillById = (id: string) => DRILLS.find((d) => d.id === id)

/** Build the concrete exercise (a Lab) of a drill for a seed. */
export function makeDrillLab(def: DrillDef, seed: number): DrillLab {
  const p = def.params(rng(seed))
  const b = def.build(p)
  const ports: Lab['ports'] = { ...b.ports }
  if (b.devices.linux && !ports.linux) ports.linux = b.devices.linux.interfaces.map((i) => i.name)
  if (b.devices.server && !ports.server) ports.server = b.devices.server.adapters?.map((a) => a.id) ?? ['eth0']
  if (b.devices.pc && !ports.pc) ports.pc = b.devices.pc.adapters?.map((a) => a.id) ?? ['eth0']
  return {
    id: `drill-${def.id}`,
    code: def.title_pl,
    title_ru: def.title_ru,
    title_pl: def.title_pl,
    summary_ru: def.goal_ru,
    summary_pl: def.goal_pl,
    station: p.X,
    devices: b.devices,
    ports,
    requiredLinks: b.requiredLinks ?? [],
    schema_ru: b.schema_ru ?? [],
    tasks: b.tasks,
    prepare: b.prepare,
    drill: def,
    params: p,
    intro_pl: b.intro_pl,
  }
}

export const topicName = (t: DrillTopic, lang: 'ru' | 'pl') => TOPICS.find((x) => x.id === t)![lang]
