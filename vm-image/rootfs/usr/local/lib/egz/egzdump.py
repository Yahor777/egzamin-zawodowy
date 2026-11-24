"""exam-dump: one JSON object with the machine state that lab checks need.

    exam-dump [--quiet] [--no-checks] [--id ID] [PATH...]

Written to /run/exam/dump.json and, when the host page mounted its IndexedDB
output device there, /mnt/exam/dump.json (read from JS with
IDBDevice.readFileAsBlob('/dump.json')). Printed to stdout unless --quiet.
Run as root (shadow, crontabs, root's history).
"""
import base64
import glob
import json
import os
import pwd
import grp
import stat
import subprocess
import sys
import time

sys.path.insert(0, "/usr/local/lib/egz")
import egznet  # noqa: E402

TEXT_MAX = 64 * 1024
HIST_MAX = 500
STATE = "/var/lib/egz-systemd"
UNITS = ["apache2", "cron", "isc-dhcp-server", "named", "nfs-server", "nmbd", "smbd", "ssh", "systemd-networkd"]
FIXED_FILES = [
    "/etc/hostname", "/etc/hosts", "/etc/fstab", "/etc/exports",
    "/etc/dhcp/dhcpd.conf", "/etc/default/isc-dhcp-server",
]


def read_text(path, limit=TEXT_MAX):
    try:
        with open(path, "rb") as f:
            data = f.read(limit + 1)
    except OSError:
        return None
    if len(data) > limit:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def lines(path):
    t = read_text(path, 4 * 1024 * 1024)
    return [] if t is None else t.splitlines()


def name_of(fn, i):
    try:
        return fn(i)[0]
    except KeyError:
        return str(i)


def users_and_groups():
    shadow = {}
    for l in lines("/etc/shadow"):
        p = l.split(":")
        if len(p) >= 9:
            shadow[p[0]] = p
    groups = []
    members = {}
    for l in lines("/etc/group"):
        p = l.split(":")
        if len(p) >= 4:
            m = [x for x in p[3].split(",") if x]
            groups.append({"name": p[0], "gid": int(p[2]) if p[2].isdigit() else p[2], "members": m})
            for u in m:
                members.setdefault(u, []).append(p[0])
    gid_name = {g["gid"]: g["name"] for g in groups}
    users = []
    for l in lines("/etc/passwd"):
        p = l.split(":")
        if len(p) < 7:
            continue
        uid, gid = int(p[2]), int(p[3])
        u = {"name": p[0], "uid": uid, "gid": gid, "gecos": p[4], "home": p[5], "shell": p[6],
             "primaryGroup": gid_name.get(gid), "groups": [], "hasPassword": None, "locked": None,
             "shadow": None, "homeExists": os.path.isdir(p[5])}
        u["groups"] = ([gid_name[gid]] if gid in gid_name else []) + [g for g in members.get(p[0], []) if g != gid_name.get(gid)]
        s = shadow.get(p[0])
        if s:
            pw = s[1]
            u["hasPassword"] = bool(pw) and pw[0] not in "!*"
            u["locked"] = pw.startswith("!")
            num = lambda x: int(x) if x.isdigit() else None  # noqa: E731
            u["shadow"] = {"lastchg": num(s[2]), "min": num(s[3]), "max": num(s[4]), "warn": num(s[5]),
                           "inactive": num(s[6]), "expire": num(s[7])}
        users.append(u)
    return users, groups


def acl_of(path):
    try:
        os.getxattr(path, "system.posix_acl_access", follow_symlinks=False)
    except (OSError, AttributeError):
        try:
            os.getxattr(path, "system.posix_acl_default", follow_symlinks=False)
        except (OSError, AttributeError):
            return None
    try:
        r = subprocess.run(["getfacl", "-cp", path], capture_output=True, text=True, timeout=10)
        return r.stdout.strip().splitlines()
    except (OSError, subprocess.SubprocessError):
        return None


def describe(path):
    try:
        st = os.lstat(path)
    except FileNotFoundError:
        return {"exists": False}
    except OSError as e:
        return {"exists": None, "error": e.strerror}
    m = st.st_mode
    t = ("symlink" if stat.S_ISLNK(m) else "dir" if stat.S_ISDIR(m) else "file" if stat.S_ISREG(m)
         else "block" if stat.S_ISBLK(m) else "char" if stat.S_ISCHR(m) else "fifo" if stat.S_ISFIFO(m)
         else "socket" if stat.S_ISSOCK(m) else "other")
    d = {"exists": True, "type": t, "mode": "%04o" % stat.S_IMODE(m), "uid": st.st_uid, "gid": st.st_gid,
         "owner": name_of(pwd.getpwuid, st.st_uid), "group": name_of(grp.getgrgid, st.st_gid),
         "size": st.st_size, "mtime": int(st.st_mtime)}
    if t == "symlink":
        d["target"] = os.readlink(path)
    elif t == "file":
        txt = read_text(path)
        if txt is not None:
            d["content"] = txt
        elif st.st_size <= TEXT_MAX:
            try:
                with open(path, "rb") as f:
                    d["contentBase64"] = base64.b64encode(f.read()).decode()
            except OSError:
                pass
    elif t == "dir":
        try:
            d["entries"] = sorted(os.listdir(path))[:500]
        except OSError:
            pass
    acl = acl_of(path)
    if acl:
        d["acl"] = acl
    return d


def services():
    out = {}
    for u in UNITS:
        def f(ext):
            return os.path.exists(f"{STATE}/{u}.{ext}")
        st = (read_text(f"{STATE}/{u}.state") or "inactive").strip()
        out[u] = {"active": st, "enabled": f("enabled") and not f("masked"), "masked": f("masked")}
    return out


def mounts():
    res = []
    for l in lines("/proc/mounts"):
        p = l.split()
        if len(p) >= 4:
            res.append({"device": p[0], "mountpoint": p[1], "fstype": p[2], "options": p[3]})
    return res


def histories():
    res = {}
    for pw in pwd.getpwall():
        if pw.pw_uid == 0 or pw.pw_uid >= 1000:
            h = os.path.join(pw.pw_dir, ".bash_history")
            if os.path.isfile(h):
                res[pw.pw_name] = lines(h)[-HIST_MAX:]
    return res


def run_check(cmd, use_stderr=False):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        out = (r.stderr if use_stderr else r.stdout + r.stderr).strip()
        return {"ok": r.returncode == 0, "rc": r.returncode, "output": out.splitlines()[-40:]}
    except (OSError, subprocess.SubprocessError) as e:
        return {"ok": None, "rc": None, "output": [str(e)]}


def network():
    rt = egznet.runtime()
    nics = []
    for n in rt:
        nics.append({"name": n["name"], "mac": n["mac"], "up": n["up"], "configured": n["configured"],
                     "dhcp4": bool((n["cfg"] or {}).get("dhcp4")),
                     "addresses": [a for a, _ in n["addrs"]],
                     "dhcpAddresses": [a for a, dyn in n["addrs"] if dyn],
                     "gateway": next((r["via"] for r in n["routes"] if r["to"] == "default"), None),
                     "routes": n["routes"], "dns": n["dns"], "search": n["search"]})
    try:
        egznet.load_config()
        valid, err = True, None
    except egznet.NetplanError as e:
        valid, err = False, e.render()
    return {"applied": egznet.read_json(egznet.NET), "interfaces": nics,
            "netplanValid": valid, "netplanError": err}


def main(argv):
    quiet = "--quiet" in argv
    checks = "--no-checks" not in argv
    dump_id = None
    paths = []
    it = iter(argv)
    for a in it:
        if a == "--id":
            dump_id = next(it, None)
        elif not a.startswith("--"):
            paths.append(a)
    users, groups = users_and_groups()
    hostname = (read_text("/etc/hostname") or "").strip()
    data = {
        "version": 1,
        "id": dump_id,
        "time": int(time.time()),
        "hostname": hostname,
        "hostnameRuntime": (read_text("/run/egz-hostname") or hostname).strip(),
        "users": users,
        "groups": groups,
        "paths": {p: describe(p) for p in paths},
        "files": {p: read_text(p) for p in FIXED_FILES},
        "netplan": {p: read_text(p) for p in sorted(glob.glob("/etc/netplan/*.yaml"))},
        "network": network(),
        "services": services(),
        "mounts": mounts(),
        "history": histories(),
        "crontabs": {os.path.basename(p): read_text(p) for p in glob.glob("/var/spool/cron/crontabs/*")},
    }
    if checks:
        data["checks"] = {
            "apache2": run_check(["apache2ctl", "configtest"]),
            "samba": run_check(["testparm", "-s", "/etc/samba/smb.conf"], use_stderr=True),
            "dhcpd": run_check(["dhcpd", "-t", "-4", "-q", "-cf", "/etc/dhcp/dhcpd.conf"]),
        }
    text = json.dumps(data, ensure_ascii=False)
    for d in ("/run/exam", "/mnt/exam"):
        if d == "/run/exam" or os.path.isdir(d):
            try:
                os.makedirs(d, exist_ok=True)
                tmp = os.path.join(d, ".dump.json.tmp")
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write(text + "\n")
                try:
                    os.replace(tmp, os.path.join(d, "dump.json"))
                except OSError:  # a host mount without rename: write in place
                    with open(os.path.join(d, "dump.json"), "w", encoding="utf-8") as f:
                        f.write(text + "\n")
                    os.remove(tmp)
            except OSError as e:
                print(f"exam-dump: {d}: {e.strerror}", file=sys.stderr)
    if not quiet:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
