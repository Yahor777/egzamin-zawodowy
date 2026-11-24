#!/usr/bin/python3
"""Emulated network for the exam VM (egz), imported by egz.py.

The browser VM (CheerpX) has no real network interfaces. This module keeps an
emulated machine whose NICs come from /data/exam/nics.json (written by the
host page) or default to VirtualBox-like enp0s3/enp0s8:

  netplan generate|apply|try|get  real YAML parsing, netplan-style errors;
                                  apply/try write /run/exam/net.json
  ip, ifconfig, resolvectl,       print the effective state: net.json +
  hostname -I                     `ip link set` overrides + DHCP leases from
                                  /data/exam/leases.json
  ping                            replies per /data/exam/reach.json
  dhcp-check CONF IFACE...        dhcpd interface/subnet check (systemctl)
"""
import ipaddress
import json
import os
import sys
import time

yaml = None  # imported lazily: only netplan parsing needs it (fast `ip`/`ping`)

NETPLAN_DIRS = ["/lib/netplan", "/etc/netplan", "/run/netplan"]
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
    global yaml
    if yaml is None:
        import yaml as _y
        yaml = _y
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


# ---------------- state files ----------------
RUN = "/run/exam"
NET = RUN + "/net.json"        # applied netplan config ("kernel" state)
LINKS = RUN + "/links.json"    # `ip link set X up/down` overrides
DEFAULT_NICS = [  # VirtualBox-like: NAT + internal network
    {"name": "enp0s3", "mac": "08:00:27:4e:66:a1"},
    {"name": "enp0s8", "mac": "08:00:27:9c:3b:12"},
]
NAT_LEASE = {"address": "10.0.2.15/24", "gateway": "10.0.2.2", "dns": ["10.0.2.3"]}


def read_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def host_json(name):
    """Files the host page writes into the DataDevice mounted at /data."""
    for p in (f"/data/exam/{name}.json", f"/data/exam-{name}.json"):
        if os.path.exists(p):
            return read_json(p)
    return None


def nics():
    h = host_json("nics")
    if isinstance(h, dict):
        h = h.get("nics")
    if isinstance(h, list) and h:
        out = []
        for n in h:
            if isinstance(n, dict) and n.get("name"):
                out.append({"name": str(n["name"]), "mac": str(n.get("mac") or "08:00:27:00:00:%02x" % (len(out) + 1))})
        if out:
            return out
    return DEFAULT_NICS


def save_applied(ifaces):
    interfaces = {}
    for name, c in ifaces.items():
        gw = c.get("gateway4")
        for r in c.get("routes", []):
            if r.get("to") == "default" and r.get("via") and ":" not in r["via"]:
                gw = gw or r["via"]
        ns = c.get("nameservers", {})
        interfaces[name] = {
            "dhcp4": bool(c.get("dhcp4", False)),
            "addresses": c.get("addresses", []),
            "gateway": gw,
            "routes": [r for r in c.get("routes", []) if r.get("to") != "default"],
            "dns": ns.get("addresses", []),
            "search": ns.get("search", []),
            "mtu": c.get("mtu", 1500),
        }
    write_json(NET, {"applied_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "interfaces": interfaces})
    try:
        os.remove(LINKS)  # a fresh apply brings configured links up again
    except OSError:
        pass


def run_generate(apply=False, quiet=False):
    try:
        ifaces = load_config()
    except NetplanError as e:
        print_warnings()
        print(e.render(), file=sys.stderr)
        if apply and quiet:  # boot with a broken YAML: no interface configured
            save_applied({})
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
    old = read_json(NET)
    save_applied(ifaces)
    print("Do you want to keep these settings?\n\n")
    print("Press ENTER before the timeout to accept the new configuration\n\n")
    sys.stdout.write(f"Changes will revert in {timeout:>3} seconds")
    sys.stdout.flush()
    import select
    try:
        r, _, _ = select.select([sys.stdin], [], [], timeout)
    except (OSError, ValueError):
        r = [sys.stdin]
    if r:
        sys.stdin.readline()
        print("\nConfiguration accepted.")
        return 0
    if old is not None:
        write_json(NET, old)
    print("\nReverting.")
    return 0


# ---------------- effective ("kernel") network state ----------------
def runtime():
    """[{name, mac, idx, up, configured, cfg, addrs: [(cidr, dynamic)], routes, dns, search}]"""
    applied = (read_json(NET) or {}).get("interfaces", {})
    links = read_json(LINKS, {}) or {}
    leases = host_json("leases")
    out = []
    for idx, n in enumerate(nics(), start=2):
        name = n["name"]
        cfg = applied.get(name)
        up = links.get(name, "up" if cfg is not None else "down") == "up"
        addrs, routes, dns, search = [], [], [], []
        if cfg is not None:
            addrs = [(a, False) for a in cfg.get("addresses", [])]
            dns, search = list(cfg.get("dns", [])), list(cfg.get("search", []))
            if cfg.get("dhcp4"):
                lease = None
                if isinstance(leases, dict):
                    lease = leases.get(name)
                elif idx == 2:  # no host file: the first NIC sits on VirtualBox NAT
                    lease = NAT_LEASE
                if isinstance(lease, str):
                    lease = {"address": lease}
                if isinstance(lease, dict) and lease.get("address"):
                    a = lease["address"] if "/" in lease["address"] else lease["address"] + "/24"
                    addrs.insert(0, (a, True))
                    if lease.get("gateway"):
                        routes.append({"to": "default", "via": lease["gateway"], "proto": "dhcp",
                                       "src": a.split("/")[0], "metric": 100})
                    dns = list(lease.get("dns", [])) + dns
            if cfg.get("gateway"):
                routes.append({"to": "default", "via": cfg["gateway"], "proto": "static"})
            for r in cfg.get("routes", []):
                rr = dict(r)
                rr["proto"] = "static"
                routes.append(rr)
        if not up:
            routes = []
        out.append({"name": name, "mac": n["mac"], "idx": idx, "up": up, "configured": cfg is not None,
                    "cfg": cfg, "addrs": addrs, "routes": routes, "dns": dns, "search": search,
                    "mtu": (cfg or {}).get("mtu", 1500)})
    return out


def ll6(mac, bare=False):
    b = [int(x, 16) for x in mac.split(":")]
    b[0] ^= 2
    s = "fe80::%x:%x:%x:%x" % ((b[0] << 8) | b[1], (b[2] << 8) | 0xff, 0xfe00 | b[3], (b[4] << 8) | b[5])
    return s if bare else s + "/64"


def find_nic(rt, name):
    for n in rt:
        if n["name"] == name:
            return n
    return None


def show_addr(only=None, brief=False, link_only=False):
    rt = runtime()
    if only and only != "lo" and not find_nic(rt, only):
        print(f'Device "{only}" does not exist.', file=sys.stderr)
        return 1
    if brief:
        if only in (None, "lo"):
            print("%-16s %-14s %s" % ("lo", "UNKNOWN", "00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP>" if link_only else "127.0.0.1/8 ::1/128"))
        for n in rt:
            if only and only != n["name"]:
                continue
            state = "UP" if n["up"] else "DOWN"
            if link_only:
                flags = "<BROADCAST,MULTICAST,UP,LOWER_UP>" if n["up"] else "<BROADCAST,MULTICAST>"
                print("%-16s %-14s %s %s" % (n["name"], state, n["mac"], flags))
            else:
                al = [a for a, _ in n["addrs"]] + ([ll6(n["mac"])] if n["up"] else [])
                print("%-16s %-14s %s" % (n["name"], state, " ".join(al)))
        return 0
    if only in (None, "lo"):
        print("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000")
        print("    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00")
        if not link_only:
            print("    inet 127.0.0.1/8 scope host lo\n       valid_lft forever preferred_lft forever")
            print("    inet6 ::1/128 scope host noprefixroute \n       valid_lft forever preferred_lft forever")
    for n in rt:
        if only and only != n["name"]:
            continue
        name, i, mtu = n["name"], n["idx"], n["mtu"]
        if n["up"]:
            print(f"{i}: {name}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu {mtu} qdisc fq_codel state UP group default qlen 1000")
        else:
            print(f"{i}: {name}: <BROADCAST,MULTICAST> mtu {mtu} qdisc fq_codel state DOWN group default qlen 1000")
        print(f"    link/ether {n['mac']} brd ff:ff:ff:ff:ff:ff")
        if link_only:
            continue
        for a, dyn in n["addrs"]:
            ipi = ipaddress.ip_interface(a)
            if ipi.version == 4:
                brd = ipi.network.broadcast_address
                extra = f" metric 100 brd {brd} scope global dynamic {name}" if dyn else f" brd {brd} scope global {name}"
                print(f"    inet {a}{extra}")
                print("       valid_lft 86313sec preferred_lft 86313sec" if dyn else "       valid_lft forever preferred_lft forever")
            else:
                print(f"    inet6 {a} scope global \n       valid_lft forever preferred_lft forever")
        if n["up"]:
            print(f"    inet6 {ll6(n['mac'])} scope link \n       valid_lft forever preferred_lft forever")
    return 0


def show_route():
    rt = [n for n in runtime() if n["up"]]
    for n in rt:
        for r in n["routes"]:
            if r["to"] == "default":
                line = f"default via {r['via']} dev {n['name']} proto {r['proto']}"
                if r.get("src"):
                    line += f" src {r['src']}"
                if r.get("metric"):
                    line += f" metric {r['metric']}"
                print(line + " ")
    for n in rt:
        for a, dyn in n["addrs"]:
            ipi = ipaddress.ip_interface(a)
            if ipi.version == 4:
                print(f"{ipi.network} dev {n['name']} proto kernel scope link src {ipi.ip}" + (" metric 100 " if dyn else " "))
        for r in n["routes"]:
            if r["to"] != "default":
                print(f"{r['to']} via {r.get('via', '')} dev {n['name']} proto static ")
    return 0


HINT = ("(песочница: интерфейсы здесь эмулированы — адреса меняй через netplan: "
        "/etc/netplan/50-cloud-init.yaml, затем sudo netplan apply)")


def set_link(name, state):
    rt = runtime()
    if not find_nic(rt, name):
        print(f'Cannot find device "{name}"', file=sys.stderr)
        return 1
    if not is_root():
        print("RTNETLINK answers: Operation not permitted", file=sys.stderr)
        return 2
    links = read_json(LINKS, {}) or {}
    links[name] = state
    write_json(LINKS, links)
    return 0


def cmd_ip(args):
    brief = False
    rest = []
    for a in args:
        if a in ("-br", "-brief", "--brief"):
            brief = True
        elif a.startswith("-"):
            continue
        else:
            rest.append(a)
    if not rest:
        print("Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\n"
              "where  OBJECT := { address | link | route | neigh | ... }", file=sys.stderr)
        return 255
    obj, rest = rest[0], rest[1:]
    is_link = obj in ("l", "li", "lin", "link")
    if is_link and rest and rest[0] == "set":
        dev = None
        state = None
        for i, a in enumerate(rest[1:]):
            if a == "dev":
                continue
            if a in ("up", "down"):
                state = a
            elif dev is None:
                dev = a
        if dev and state:
            return set_link(dev, state)
        if not is_root():
            print("RTNETLINK answers: Operation not permitted", file=sys.stderr)
            return 2
        print("RTNETLINK answers: Operation not supported", file=sys.stderr)
        print(HINT, file=sys.stderr)
        return 2
    if rest and rest[0] in ("add", "a", "del", "d", "delete", "set", "change", "replace", "flush", "append"):
        if not is_root():
            print("RTNETLINK answers: Operation not permitted", file=sys.stderr)
        else:
            print("RTNETLINK answers: Operation not supported", file=sys.stderr)
            print(HINT, file=sys.stderr)
        return 2
    if rest and rest[0] in ("show", "list", "lst", "sh", "ls", "l", "s"):
        rest = rest[1:]
    dev = None
    for i, a in enumerate(rest):
        if a == "dev" and i + 1 < len(rest):
            dev = rest[i + 1]
        elif a not in ("dev", "up") and dev is None:
            dev = a
    if obj in ("a", "ad", "add", "addr", "addre", "addres", "address"):
        return show_addr(dev, brief)
    if is_link:
        return show_addr(dev, brief, link_only=True)
    if obj in ("r", "ro", "rou", "rout", "route"):
        return show_route()
    if obj in ("n", "ne", "nei", "neigh", "neighbor", "neighbour"):
        return 0
    print(f'Object "{obj}" is unknown, try "ip help".', file=sys.stderr)
    return 1


def cmd_ifconfig(args):
    rt = runtime()
    show_all = "-a" in args
    args = [a for a in args if not a.startswith("-")]
    if len(args) >= 2 and args[1] in ("up", "down"):
        return set_link(args[0], args[1])
    if len(args) >= 2:
        if not is_root():
            print("SIOCSIFADDR: Operation not permitted", file=sys.stderr)
        else:
            print("SIOCSIFADDR: Operation not supported", file=sys.stderr)
            print(HINT, file=sys.stderr)
        return 1
    only = args[0] if args else None
    if only and only != "lo" and not find_nic(rt, only):
        print(f"{only}: error fetching interface information: Device not found", file=sys.stderr)
        return 1
    blocks = []
    for n in rt:
        if (only and only != n["name"]) or (not only and not show_all and not n["up"]):
            continue
        if n["up"]:
            b = [f"{n['name']}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu {n['mtu']}"]
        else:
            b = [f"{n['name']}: flags=4098<BROADCAST,MULTICAST>  mtu {n['mtu']}"]
        for a, _ in n["addrs"]:
            ipi = ipaddress.ip_interface(a)
            if ipi.version == 4:
                b.append(f"        inet {ipi.ip}  netmask {ipi.network.netmask}  broadcast {ipi.network.broadcast_address}")
        if n["up"]:
            b.append(f"        inet6 {ll6(n['mac'], True)}  prefixlen 64  scopeid 0x20<link>")
        b.append(f"        ether {n['mac']}  txqueuelen 1000  (Ethernet)")
        b += ["        RX packets 0  bytes 0 (0.0 B)", "        RX errors 0  dropped 0  overruns 0  frame 0",
              "        TX packets 0  bytes 0 (0.0 B)", "        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0"]
        blocks.append(b)
    if only in (None, "lo"):
        blocks.append(["lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536", "        inet 127.0.0.1  netmask 255.0.0.0",
                       "        inet6 ::1  prefixlen 128  scopeid 0x10<host>", "        loop  txqueuelen 1000  (Local Loopback)",
                       "        RX packets 0  bytes 0 (0.0 B)", "        RX errors 0  dropped 0  overruns 0  frame 0",
                       "        TX packets 0  bytes 0 (0.0 B)", "        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0"])
    for b in blocks:
        print("\n".join(b) + "\n")
    return 0


def cmd_resolvectl(args):
    if args and args[0] not in ("status",):
        if args[0] == "dns":
            for n in runtime():
                print(f"Link {n['idx']} ({n['name']}): {' '.join(n['dns'])}".rstrip())
            return 0
        print(f"Unknown command verb '{args[0]}'.", file=sys.stderr)
        return 1
    print("Global\n       Protocols: -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported\nresolv.conf mode: stub")
    for n in runtime():
        print(f"\nLink {n['idx']} ({n['name']})")
        if n["up"] and n["dns"]:
            dr = "+DefaultRoute" if any(r["to"] == "default" for r in n["routes"]) else "-DefaultRoute"
            print("    Current Scopes: DNS")
            print(f"         Protocols: {dr} -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported")
            print(f"Current DNS Server: {n['dns'][0]}")
            print(f"       DNS Servers: {' '.join(n['dns'])}")
            if n["search"]:
                print(f"        DNS Domain: {' '.join(n['search'])}")
        else:
            print("    Current Scopes: none")
            print("         Protocols: -DefaultRoute -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported")
    return 0


def cmd_hostname_i():
    al = []
    for n in runtime():
        if n["up"]:
            al += [a.split("/")[0] for a, _ in n["addrs"]]
    print(" ".join(al) + " ")
    return 0


# ---------------- ping ----------------
def resolve(target):
    try:
        return str(ipaddress.ip_address(target))
    except ValueError:
        pass
    try:
        with open("/etc/hosts") as f:
            for line in f:
                parts = line.split("#")[0].split()
                if len(parts) >= 2 and target in parts[1:]:
                    return parts[0]
    except OSError:
        pass
    return None


def cmd_ping(args):
    import random
    count, interval, quiet, deadline = None, 1.0, False, None
    target = None
    it = iter(args)
    for a in it:
        if a == "-c":
            count = int(next(it, "1"))
        elif a.startswith("-c") and a[2:].isdigit():
            count = int(a[2:])
        elif a == "-i":
            interval = float(next(it, "1"))
        elif a in ("-W", "-s", "-t", "-I"):
            next(it, None)
        elif a == "-w":
            deadline = float(next(it, "0"))
        elif a == "-q":
            quiet = True
        elif a.startswith("-"):
            continue
        else:
            target = a
    if not target:
        print("ping: usage error: Destination address required", file=sys.stderr)
        return 1
    ip = resolve(target)
    if ip is None:
        print(f"ping: {target}: Temporary failure in name resolution", file=sys.stderr)
        return 2
    addr = ipaddress.ip_address(ip)
    rt = [n for n in runtime() if n["up"]]
    own = {ipaddress.ip_interface(a).ip for n in rt for a, _ in n["addrs"]}
    reach = host_json("reach") or {}
    src, onlink, via = None, False, None
    if addr.is_loopback or addr in own:
        state = True
    else:
        for n in rt:
            for a, _ in n["addrs"]:
                ipi = ipaddress.ip_interface(a)
                if ipi.version == addr.version and addr in ipi.network:
                    src, onlink = str(ipi.ip), True
        if not onlink:
            for n in rt:
                for r in n["routes"]:
                    if r["to"] == "default" or (r["to"] != "default" and addr in ipaddress.ip_network(r["to"], strict=False)):
                        via = r.get("via")
                        src = next((ipaddress.ip_interface(a).ip for a, _ in n["addrs"]), None)
                        break
                if via:
                    break
            if not via:
                print("ping: connect: Network is unreachable", file=sys.stderr)
                return 2
        state = reach.get(ip, reach.get(target))
    info = state if isinstance(state, dict) else {}
    ok = bool(info.get("reply", True)) if isinstance(state, dict) else state is True
    ttl = int(info.get("ttl", 64 if (onlink or addr.is_loopback or addr in own) else 63))
    base_ms = float(info.get("ms", 0.05 if (addr.is_loopback or addr in own) else 0.6))
    print(f"PING {target} ({ip}) 56(84) bytes of data.")
    sent = recv = errs = 0
    times = []
    start = time.time()
    try:
        while count is None or sent < count:
            if sent:
                time.sleep(interval)
            sent += 1
            if ok:
                ms = round(base_ms * random.uniform(0.7, 1.4), 3)
                times.append(ms)
                recv += 1
                if not quiet:
                    print(f"64 bytes from {ip}: icmp_seq={sent} ttl={ttl} time={ms} ms")
            elif onlink:
                errs += 1
                if not quiet:
                    print(f"From {src} icmp_seq={sent} Destination Host Unreachable")
            sys.stdout.flush()
            if deadline and time.time() - start >= deadline:
                break
        if recv < sent and errs < sent:  # the last request waits for its timeout, like ping -W
            time.sleep(min(interval, 1.0))
    except KeyboardInterrupt:
        print("^C" if sys.stdout.isatty() else "")
    el = int((time.time() - start) * 1000)
    loss = 0 if sent == 0 else round(100 * (sent - recv) / sent)
    print(f"--- {target} ping statistics ---")
    line = f"{sent} packets transmitted, {recv} received"
    if errs:
        line += f", +{errs} errors"
    print(f"{line}, {loss}% packet loss, time {el}ms")
    if times:
        avg = sum(times) / len(times)
        mdev = (sum((t - avg) ** 2 for t in times) / len(times)) ** 0.5
        print(f"rtt min/avg/max/mdev = {min(times):.3f}/{avg:.3f}/{max(times):.3f}/{mdev:.3f} ms")
    return 0 if recv else 1


# ---------------- dhcpd interface check (used by systemctl) ----------------
def cmd_dhcp_check(conf, wanted):
    """Mimics dhcpd's interface discovery: every listening interface needs an
    IPv4 address (effective state) inside a `subnet` declaration."""
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
    rt = {n["name"]: n for n in runtime()}
    names = wanted or [n for n, v in rt.items() if v["up"]]
    listening = 0
    for name in names:
        if name not in rt:
            print(f"Error getting hardware address for \"{name}\": No such device\n\nexiting.")
            return 1
        v4 = [ipaddress.ip_interface(a) for a, _ in rt[name]["addrs"] if ipaddress.ip_interface(a).version == 4]
        if not rt[name]["up"]:
            v4 = []
        if any(any(a.ip in s for s in subnets) for a in v4):
            listening += 1
            continue
        if v4:
            print(f"No subnet declaration for {name} ({v4[0].ip}).")
        else:
            print(f"No subnet declaration for {name} (no IPv4 addresses).")
        print(f"** Ignoring requests on {name}.  If this is not what")
        print("   you want, please write a subnet declaration")
        print("   in your dhcpd.conf file for the network segment")
        print(f"   to which interface {name} is attached. **")
        print("")
    if listening == 0:
        print("")
        print("Not configured to listen on any interfaces!")
        return 1
    return 0


# ---------------- netplan CLI ----------------
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


def cmd_netplan(argv):
    args = [a for a in argv if a != "--debug"]
    if not args:
        usage()
        return 1
    cmd, rest = args[0], args[1:]
    if cmd == "boot":  # VM start: configure "interfaces" from the YAML, silently
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
        return cmd_try(rest) if cmd == "try" else run_generate(apply=True)
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


COMMANDS = {
    "netplan": cmd_netplan,
    "ip": cmd_ip,
    "ifconfig": cmd_ifconfig,
    "resolvectl": cmd_resolvectl,
    "ping": cmd_ping,
    "hostname-I": lambda a: cmd_hostname_i(),
    "dhcp-check": lambda a: cmd_dhcp_check(a[0], a[1:]),
}


def main(argv):
    if not argv or argv[0] not in COMMANDS:
        print("usage: egz.py {%s} ..." % ",".join(COMMANDS), file=sys.stderr)
        return 2
    try:
        return COMMANDS[argv[0]](argv[1:])
    except KeyboardInterrupt:
        return 130
    except BrokenPipeError:
        return 0
