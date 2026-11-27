// Pure (React-free) entry point of the Linux simulator.
import './cmd_files.ts'
import './cmd_users.ts'
import './cmd_sys.ts'
import './cmd_disk.ts'
import './cmd_net.ts'
import './cmd_extra.ts'
import './cmd_hw.ts'
import './cmd_nmcli.ts'
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
  /** DHCP client: the lease the DHCP server on the interface's cable offers, or null (no server, no address). Absent = standalone NAT-like sandbox. */
  dhcp?(iface: { name: string; mac: string }): { ip: string; mask: string; gateway: string; dns: string[]; server: string; domain?: string } | null
  /** IIS FTP backend when the bench network model is available */
  ftp?: import('../pc/ftp.ts').FtpBackend
}

/** `resume`: continue the session saved in `st.session` (cwd, su stack…) instead of a fresh login. */
export function createShell(st: LinuxState, io: TermIO, onCommit: (st: LinuxState) => void, network?: LinuxNetwork, user?: string, resume = false): Shell {
  const sh = new Shell(st, io, onCommit)
  sh.network = network
  if (resume) sh.resumeOrLogin(user || st.loginUser)
  else sh.login(user || st.loginUser)
  return sh
}
