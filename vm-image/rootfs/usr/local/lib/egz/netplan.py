#!/usr/bin/python3
"""Emulated network for the exam VM (egz).

The browser VM (CheerpX) has no real network interfaces, so this module keeps
an emulated machine with two VirtualBox-like NICs (enp0s3, enp0s8):

  netplan generate|apply|try|get   validate /etc/netplan/*.yaml (real YAML
                                   parsing, netplan-style errors); apply/try
                                   store the result as the "kernel" state
  ip addr|link|route ...           show the applied state (`ip` wrapper)
  hostname-I                       addresses for `hostname -I`
  dhcp-check CONF IFACE...         dhcpd interface/subnet check for systemctl
"""
import ipaddress
import json
import os
import select
import sys
import time

import yaml

NETPLAN_DIRS = ["/lib/netplan", "/etc/netplan", "/run/netplan"]
APPLIED = "/var/lib/egz-net/applied.json"
NICS = [  # name, MAC (VirtualBox OUI 08:00:27)
    ("enp0s3", "08:00:27:4e:66:a1"),
    ("enp0s8", "08:00:27:9c:3b:12"),
]
NIC_NAMES = [n for n, _ in NICS]
BOOL_TRUE = {"true", "yes", "on", "y"}
BOOL_FALSE = {"false", "no", "off", "n"}
ETH_KEYS = {
    "dhcp4", "dhcp6", "addresses", "gateway4", "gateway6", "routes", "nameservers",
    "match", "set-name", "optional", "mtu", "macaddress", "link-local", "accept-ra",
    "dhcp4-overrides", "dhcp6-overrides", "wakeonlan", "renderer", "critical",
    "dhcp-identifier", "ipv6-privacy", "routing-policy", "activation-mode",
}
NET_KEYS = {"version", "renderer", "ethernets", "bonds", "bridges", "vlans", "wifis", "tunnels"}
ROUTE_KEYS = {"to", "via", "metric", "on-link", "scope", "table", "from", "type"}


class NetplanError(Exception):
    def __init__(self, path, mark, msg, kind="Error in network definition"):
        super().__init__(msg)
        self.path, self.mark, self.msg, self.kind = path, mark, msg, kind

    def render(self):
        if self.mark is None:
            return f"{self.path}: {self.kind}: {self.msg}"
        line, col = self.mark.line, self.mark.column
        out = f"{self.path}:{line + 1}:{col}: {self.kind}: {self.msg}"
        try:
            with open(self.path, encoding="utf-8", errors="replace") as f:
                src = f.read().splitlines()
            if line < len(src):
                out += "\n" + src[line] + "\n" + " " * col + "^"
        except OSError:
            pass
        return out


warnings = []


def warn(msg):
    t = time.strftime("%H:%M:%S") + ".%03d" % (int(time.time() * 1000) % 1000)
    warnings.append(f"** (generate:{os.getpid()}): WARNING **: {t}: {msg}")


def scalar(path, node, what="scalar"):
    if not isinstance(node, yaml.ScalarNode):
        raise NetplanError(path, node.start_mark, f"expected {what}")
    return node.value


def boolean(path, node):
    v = scalar(path, node).lower()
    if v in BOOL_TRUE:
        return True
    if v in BOOL_FALSE:
        return False
    raise NetplanError(path, node.start_mark, f"invalid boolean value '{node.value}'")


def mapping(path, node):
    if not isinstance(node, yaml.MappingNode):
        raise NetplanError(path, node.start_mark, "expected mapping (check indentation)")
    seen = set()
    for k, v in node.value:
        key = scalar(path, k)
        if key in seen:
            raise NetplanError(path, k.start_mark, f"duplicate key '{key}'")
        seen.add(key)
        yield key, k, v


def sequence(path, node):
    if not isinstance(node, yaml.SequenceNode):
        raise NetplanError(path, node.start_mark, "expected sequence")
    return node.value


def ip_addr(path, node, v4only=False):
    s = scalar(path, node)
    try:
        a = ipaddress.ip_address(s)
    except ValueError:
        if v4only:
            raise NetplanError(path, node.start_mark, f"invalid IPv4 address '{s}'")
        raise NetplanError(path, node.start_mark,
                           f"malformed address '{s}', must be X.X.X.X or X:X:X:X:X:X:X:X")
    if v4only and a.version != 4:
        raise NetplanError(path, node.start_mark, f"invalid IPv4 address '{s}'")
    return str(a)


def cidr(path, node):
    if isinstance(node, yaml.MappingNode) and len(node.value) == 1:  # "- 10.0.0.1/24: {label: x}"
        node = node.value[0][0]
    s = scalar(path, node)
    if "/" not in s:
        raise NetplanError(path, node.start_mark, f"address '{s}' is missing /prefixlength")
    ip, _, pfx = s.partition("/")
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        raise NetplanError(path, node.start_mark,
                           f"malformed address '{s}', must be X.X.X.X/NN or X:X:X:X:X:X:X:X/NN")
    if not pfx.isdigit() or int(pfx) > (32 if a.version == 4 else 128):
        raise NetplanError(path, node.start_mark, f"invalid prefix length in address '{s}'")
    return f"{a}/{int(pfx)}"


def parse_ethernet(path, name, node, iface):
    for key, knode, v in mapping(path, node):
        if key not in ETH_KEYS:
            raise NetplanError(path, knode.start_mark, f"unknown key '{key}'")
        if key in ("dhcp4", "dhcp6", "optional", "critical"):
            iface[key] = boolean(path, v)
        elif key == "addresses":
            iface["addresses"] = [cidr(path, a) for a in sequence(path, v)]
        elif key == "gateway4":
            iface["gateway4"] = ip_addr(path, v, v4only=True)
            warn("`gateway4` has been deprecated, use default routes instead.\n"
                 "See the 'Default routes' section of the documentation for more details.")
        elif key == "gateway6":
            iface["gateway6"] = ip_addr(path, v)
        elif key == "routes":
            routes = []
            for r in sequence(path, v):
                route = {}
                for rk, rknode, rv in mapping(path, r):
                    if rk not in ROUTE_KEYS:
                        raise NetplanError(path, rknode.start_mark, f"unknown key '{rk}'")
                    if rk == "to":
                        t = scalar(path, rv)
                        if t == "default":
                            route["to"] = "default"
                        else:
                            if "/" not in t:
                                t += "/32"
                            try:
                                net = ipaddress.ip_network(t, strict=False)
                            except ValueError:
                                raise NetplanError(path, rv.start_mark, f"invalid IP family '{scalar(path, rv)}'")
                            route["to"] = "default" if net.prefixlen == 0 else str(net)
                    elif rk == "via":
                        route["via"] = ip_addr(path, rv)
                    elif rk == "metric":
                        m = scalar(path, rv)
                        if not m.isdigit():
                            raise NetplanError(path, rv.start_mark, f"invalid unsigned int value '{m}'")
                        route["metric"] = int(m)
                    elif rk == "on-link":
                        route["on-link"] = boolean(path, rv)
                    else:
                        route[rk] = scalar(path, rv)
                if "to" not in route or ("via" not in route and route.get("scope") != "link"):
                    raise NetplanError(path, r.start_mark, "route must include both a 'to' and 'via' IP")
                routes.append(route)
            iface["routes"] = routes
        elif key == "nameservers":
            ns = {}
            for nk, nknode, nv in mapping(path, v):
                if nk == "addresses":
                    ns["addresses"] = [ip_addr(path, a) for a in sequence(path, nv)]
                elif nk == "search":
                    ns["search"] = [scalar(path, a) for a in sequence(path, nv)]
                else:
                    raise NetplanError(path, nknode.start_mark, f"unknown key '{nk}'")
            iface["nameservers"] = ns
        elif key == "mtu":
            m = scalar(path, v)
            if not m.isdigit():
                raise NetplanError(path, v.start_mark, f"invalid unsigned int value '{m}'")
            iface["mtu"] = int(m)
        else:
            iface[key] = yaml.load(yaml.serialize(v), Loader=yaml.SafeLoader)


def config_files():
    files = {}
    for d in NETPLAN_DIRS:  # later dirs override files with the same name
        try:
            names = os.listdir(d)
        except OSError:
            continue
        for n in names:
            if n.endswith(".yaml"):
                files[n] = os.path.join(d, n)
    return [files[n] for n in sorted(files)]


def load_config():
    """Returns {iface: {...}} merged from all YAML files; raises NetplanError."""
    ifaces = {}
    for path in config_files():
        try:
            st = os.stat(path)
            if st.st_mode & 0o077:
                warn(f"Permissions for {path} are too open. Netplan configuration should NOT be accessible by others.")
            with open(path, encoding="utf-8") as f:
                text = f.read()
        except PermissionError:
            raise NetplanError(path, None, "Permission denied", kind="Failed to read")
        if "\t" in text:
            for i, line in enumerate(text.splitlines()):
                stripped = line.lstrip(" ")
                if stripped.startswith("\t"):
                    m = yaml.error.Mark(path, 0, i, len(line) - len(stripped), None, None)
                    raise NetplanError(path, m, "tabs are not allowed for indent:", kind="Invalid YAML")
        try:
            root = yaml.compose(text, Loader=yaml.SafeLoader)
        except yaml.MarkedYAMLError as e:
            mark = e.problem_mark or e.context_mark
            raise NetplanError(path, mark, (e.problem or e.context or "error") + ":", kind="Invalid YAML")
        if root is None:
            continue
        for key, knode, v in mapping(path, root):
            if key != "network":
                raise NetplanError(path, knode.start_mark, f"unknown key '{key}'")
            for nk, nknode, nv in mapping(path, v):
                if nk not in NET_KEYS:
                    raise NetplanError(path, nknode.start_mark, f"unknown key '{nk}'")
                if nk == "version":
                    if scalar(path, nv) != "2":
                        raise NetplanError(path, nv.start_mark, "Only version 2 is supported")
                elif nk == "renderer":
                    r = scalar(path, nv)
                    if r not in ("networkd", "NetworkManager"):
                        raise NetplanError(path, nv.start_mark, f"unknown renderer '{r}'")
                elif nk == "ethernets":
                    for name, nameknode, ev in mapping(path, nv):
                        iface = ifaces.setdefault(name, {})
                        if isinstance(ev, yaml.MappingNode):
                            parse_ethernet(path, name, ev, iface)
                        elif not (isinstance(ev, yaml.ScalarNode) and ev.value in ("", "{}")):
                            mapping(path, ev).__next__()
                else:
                    mapping(path, nv)  # bonds/bridges/...: only check it's a mapping
    return ifaces


def print_warnings():
    for w in warnings:
        print(w, file=sys.stderr)


def is_root():
    return os.geteuid() == 0


def save_applied(ifaces):
    os.makedirs(os.path.dirname(APPLIED), exist_ok=True)
    with open(APPLIED, "w") as f:
        json.dump(ifaces, f, indent=1)


def load_applied():
    try:
        with open(APPLIED) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def run_generate(apply=False, quiet=False):
    try:
        ifaces = load_config()
    except NetplanError as e:
        print_warnings()
        print(e.render(), file=sys.stderr)
        return 1
    if not quiet:
        print_warnings()
    if apply:
        save_applied(ifaces)
    return 0


def cmd_try(args):
    timeout = 120
    for a in args:
        if a.startswith("--timeout"):
            try:
                timeout = int(a.split("=", 1)[1])
            except (IndexError, ValueError):
                pass
    try:
        ifaces = load_config()
    except NetplanError as e:
        print_warnings()
        print(e.render(), file=sys.stderr)
        return 1
    print_warnings()
    old = load_applied()
    save_applied(ifaces)
    print("Do you want to keep these settings?\n\n")
    print("Press ENTER before the timeout to accept the new configuration\n\n")
    sys.stdout.write(f"Changes will revert in {timeout:>3} seconds")
    sys.stdout.flush()
    try:
        r, _, _ = select.select([sys.stdin], [], [], timeout)
    except (OSError, ValueError):
        r = [sys.stdin]
    if r:
        sys.stdin.readline()
        print("\nConfiguration accepted.")
        return 0
    save_applied(old)
    print("\nReverting.")
    return 0


# ---------------- emulated "kernel" state ----------------
def runtime():
    """List of (name, mac, iface-config-or-None, [(addr/prefix, dynamic)], routes)."""
    applied = load_applied()
    out = []
    dhcp_used = False
    for name, mac in NICS:
        cfg = applied.get(name)
        addrs, routes = [], []
        if cfg is not None:
            for a in cfg.get("addresses", []):
                addrs.append((a, False))
            if cfg.get("dhcp4") and not dhcp_used and name == "enp0s3":
                # VirtualBox NAT: the only network with a DHCP server
                dhcp_used = True
                addrs.insert(0, ("10.0.2.15/24", True))
                routes.append({"to": "default", "via": "10.0.2.2", "proto": "dhcp", "src": "10.0.2.15", "metric": 100})
            if cfg.get("gateway4"):
                routes.append({"to": "default", "via": cfg["gateway4"], "proto": "static"})
            for r in cfg.get("routes", []):
                rr = dict(r)
                rr["proto"] = "static"
                routes.append(rr)
        out.append((name, mac, cfg, addrs, routes))
    return out


def ll6(mac):
    b = [int(x, 16) for x in mac.split(":")]
    b[0] ^= 2
    return "fe80::%x:%x:%x:%x/64" % ((b[0] << 8) | b[1], (b[2] << 8) | 0xff, 0xfe00 | b[3], (b[4] << 8) | b[5])


def show_addr(only=None, brief=False, link_only=False):
    rt = runtime()
    if only and only != "lo" and only not in NIC_NAMES:
        print(f'Device "{only}" does not exist.', file=sys.stderr)
        return 1
    if brief:
        if only in (None, "lo"):
            print("%-16s %-14s %s" % ("lo", "UNKNOWN", "00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP>" if link_only else "127.0.0.1/8 ::1/128"))
        for name, mac, cfg, addrs, _ in rt:
            if only and only != name:
                continue
            state = "UP" if cfg is not None else "DOWN"
            if link_only:
                flags = "<BROADCAST,MULTICAST,UP,LOWER_UP>" if cfg is not None else "<BROADCAST,MULTICAST>"
                print("%-16s %-14s %s %s" % (name, state, mac, flags))
            else:
                al = [a for a, _ in addrs] + ([ll6(mac)] if cfg is not None else [])
                print("%-16s %-14s %s" % (name, state, " ".join(al)))
        return 0
    if only in (None, "lo"):
        print("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000")
        print("    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00")
        if not link_only:
            print("    inet 127.0.0.1/8 scope host lo\n       valid_lft forever preferred_lft forever")
            print("    inet6 ::1/128 scope host noprefixroute \n       valid_lft forever preferred_lft forever")
    for i, (name, mac, cfg, addrs, _) in enumerate(rt, start=2):
        if only and only != name:
            continue
        up = cfg is not None
        mtu = (cfg or {}).get("mtu", 1500)
        if up:
            print(f"{i}: {name}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu {mtu} qdisc fq_codel state UP group default qlen 1000")
        else:
            print(f"{i}: {name}: <BROADCAST,MULTICAST> mtu {mtu} qdisc noop state DOWN group default qlen 1000")
        print(f"    link/ether {mac} brd ff:ff:ff:ff:ff:ff")
        if link_only:
            continue
        for a, dyn in addrs:
            ipi = ipaddress.ip_interface(a)
            if ipi.version == 4:
                brd = ipi.network.broadcast_address
                extra = f" metric 100 brd {brd} scope global dynamic {name}" if dyn else f" brd {brd} scope global {name}"
                print(f"    inet {a}{extra}")
                print("       valid_lft 86313sec preferred_lft 86313sec" if dyn else "       valid_lft forever preferred_lft forever")
            else:
                print(f"    inet6 {a} scope global \n       valid_lft forever preferred_lft forever")
        if up:
            print(f"    inet6 {ll6(mac)} scope link \n       valid_lft forever preferred_lft forever")
    return 0


def show_route():
    for name, mac, cfg, addrs, routes in runtime():
        for r in routes:
            if r["to"] == "default":
                line = f"default via {r['via']} dev {name} proto {r['proto']}"
                if r.get("src"):
                    line += f" src {r['src']}"
                if r.get("metric"):
                    line += f" metric {r['metric']}"
                print(line + " ")
        for a, dyn in addrs:
            ipi = ipaddress.ip_interface(a)
            if ipi.version != 4:
                continue
            line = f"{ipi.network} dev {name} proto kernel scope link src {ipi.ip}"
            print(line + (" metric 100 " if dyn else " "))
        for r in routes:
            if r["to"] != "default":
                print(f"{r['to']} via {r.get('via', '')} dev {name} proto static ")
    return 0


HINT = ("(песочница: интерфейсы здесь эмулированы — меняй сеть через netplan: "
        "/etc/netplan/50-cloud-init.yaml, затем sudo netplan apply)")


def cmd_ip(args):
    brief = False
    fam_args = []
    for a in args:
        if a in ("-br", "-brief", "--brief"):
            brief = True
        elif a in ("-4", "-6", "-c", "-color", "--color", "-s", "-d", "-details") or a.startswith("-c="):
            continue
        else:
            fam_args.append(a)
    if not fam_args:
        print("Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\n"
              "where  OBJECT := { address | link | route | neigh | ... }")
        return 255
    obj, rest = fam_args[0], fam_args[1:]
    dev = None
    if rest and rest[0] in ("add", "a", "del", "d", "delete", "set", "change", "replace", "flush", "append"):
        if not is_root():
            print("RTNETLINK answers: Operation not permitted", file=sys.stderr)
        else:
            print("RTNETLINK answers: Operation not supported", file=sys.stderr)
            print(HINT, file=sys.stderr)
        return 2
    if rest and rest[0] in ("show", "list", "lst", "sh", "ls", "l", "s"):
        rest = rest[1:]
    for i, a in enumerate(rest):
        if a == "dev" and i + 1 < len(rest):
            dev = rest[i + 1]
        elif a not in ("dev", "up") and dev is None and not a.startswith("-"):
            dev = a
    if obj in ("a", "ad", "add", "addr", "addre", "addres", "address"):
        return show_addr(dev, brief)
    if obj in ("l", "li", "lin", "link"):
        return show_addr(dev, brief, link_only=True)
    if obj in ("r", "ro", "rou", "rout", "route"):
        return show_route()
    if obj in ("n", "ne", "nei", "neigh", "neighbor", "neighbour"):
        return 0
    print(f'Object "{obj}" is unknown, try "ip help".', file=sys.stderr)
    return 1


def cmd_hostname_i():
    al = []
    for _, _, _, addrs, _ in runtime():
        al += [a.split("/")[0] for a, _ in addrs]
    print(" ".join(al) + " ")
    return 0


def cmd_dhcp_check(conf, wanted):
    """Mimics dhcpd's interface discovery: every listening interface needs an
    IPv4 address (from the applied netplan) inside a `subnet` declaration."""
    import re
    try:
        text = open(conf, encoding="utf-8", errors="replace").read()
    except OSError:
        return 0
    text = re.sub(r"#.*", "", text)
    subnets = []
    for net, mask in re.findall(r"\bsubnet\s+([0-9.]+)\s+netmask\s+([0-9.]+)", text):
        try:
            subnets.append(ipaddress.ip_network(f"{net}/{mask}", strict=False))
        except ValueError:
            pass
    rt = {name: addrs for name, _, cfg, addrs, _ in runtime() if cfg is not None}
    names = wanted or list(rt)
    listening = 0
    for n in names:
        if n not in NIC_NAMES:
            print(f"Error getting hardware address for \"{n}\": No such device")
            print("")
            print("If you think you have received this message due to a bug rather")
            print("than a configuration issue please read the section on submitting")
            print("bugs on either our web page at www.isc.org or in the README file")
            print("before submitting a bug.  These pages explain the proper")
            print("process and the information we find helpful for debugging.")
            print("")
            print("exiting.")
            return 1
        v4 = [ipaddress.ip_interface(a) for a, _ in rt.get(n, []) if ipaddress.ip_interface(a).version == 4]
        if any(any(a.ip in s for s in subnets) for a in v4):
            listening += 1
            continue
        if v4:
            print(f"No subnet declaration for {n} ({v4[0].ip}).")
        else:
            print(f"No subnet declaration for {n} (no IPv4 addresses).")
        print(f"** Ignoring requests on {n}.  If this is not what")
        print("   you want, please write a subnet declaration")
        print("   in your dhcpd.conf file for the network segment")
        print(f"   to which interface {n} is attached. **")
        print("")
    if listening == 0:
        print("")
        print("Not configured to listen on any interfaces!")
        return 1
    return 0


def usage():
    print("usage: netplan [-h] [--debug]  ...\n\n"
          "Network configuration in YAML\n\n"
          "Available commands:\n"
          "    help      Show this help message\n"
          "    apply     Apply current netplan config to running system\n"
          "    generate  Generate backend specific configuration files from /etc/netplan/*.yaml\n"
          "    get       Get a setting by specifying a nested key like \"ethernets.eth0.addresses\", or \"all\"\n"
          "    try       Try to apply a new netplan config to running system, with automatic rollback\n"
          "    status    Query networking state of the running system")


def main(argv):
    args = [a for a in argv if a != "--debug"]
    if not args:
        usage()
        return 1
    cmd, rest = args[0], args[1:]
    if cmd == "ip":
        return cmd_ip(rest)
    if cmd == "hostname-I":
        return cmd_hostname_i()
    if cmd == "dhcp-check":
        return cmd_dhcp_check(rest[0], rest[1:])
    if cmd == "boot":  # at VM start: configure "interfaces" from the YAML, silently
        return run_generate(apply=True, quiet=True)
    if cmd in ("help", "-h", "--help"):
        usage()
        return 0
    if cmd == "generate":
        return run_generate()
    if cmd in ("apply", "try"):
        if not is_root():
            print(f"Permission denied: {cmd} needs root privileges (use sudo)", file=sys.stderr)
            return 1
        if cmd == "try":
            return cmd_try(rest)
        return run_generate(apply=True)
    if cmd == "get":
        try:
            ifaces = load_config()
        except NetplanError as e:
            print(e.render(), file=sys.stderr)
            return 1
        print(yaml.safe_dump({"network": {"version": 2, "ethernets": ifaces}}, default_flow_style=False, sort_keys=False), end="")
        return 0
    if cmd == "status":
        return show_addr()
    print(f"netplan: error: argument : invalid choice: '{cmd}' (choose from 'help', 'apply', 'generate', 'get', 'info', 'ip', 'set', 'rebind', 'status', 'try')", file=sys.stderr)
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        sys.exit(130)
