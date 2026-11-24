// Pure (React-free) entry point of the Linux simulator.
import './cmd_files.ts'
import './cmd_users.ts'
import './cmd_sys.ts'
import './cmd_disk.ts'
import './cmd_net.ts'
import type { LinuxState } from './model.ts'
import type { LinuxIface } from '../types.ts'
import { Shell, type TermIO } from './shell.ts'

export type { LinuxState } from './model.ts'
export { createLinuxState, type LinuxSetup } from './state.ts'
export { linuxApi } from './api.ts'
export { Shell, Interrupt, type TermIO, type EditRequest } from './shell.ts'

/** Supplied by the integrator: decides whether a ping leaves the server and gets an answer. */
export interface LinuxNetwork {
  ping(fromIfaces: LinuxIface[], gateway: string | null, target: string): { ok: boolean; reason?: string }
}

export function createShell(st: LinuxState, io: TermIO, onCommit: (st: LinuxState) => void, network?: LinuxNetwork, user?: string): Shell {
  const sh = new Shell(st, io, onCommit)
  sh.network = network
  sh.login(user || st.loginUser)
  return sh
}
