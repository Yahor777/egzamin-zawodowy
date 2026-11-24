# Exam-like Debian disk for the in-browser Linux (app/public/vm/, CheerpX).
#
# CheerpX emulates 32-bit x86, so the image must be i386. Built in CI by
# .github/workflows/pages.yml -> vm-image/build-ext2.sh, which turns the
# container filesystem into an ext2 image split into 128 KiB chunks
# (the format CheerpX.GitHubDevice reads, same as leaningtech/webvm).
#
# Local build:  docker buildx build --platform linux/386 -t egz-vm vm-image
#               vm-image/build-ext2.sh egz-vm /tmp/out
FROM docker.io/i386/debian:bookworm
ARG DEBIAN_FRONTEND=noninteractive

# Never start daemons from package scripts (no init system here, and the
# same rule must hold later inside the VM when apt reinstalls a package).
RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d && chmod 755 /usr/sbin/policy-rc.d

# Keep man pages (students use `man`), drop docs and foreign locales.
COPY rootfs/etc/dpkg/dpkg.cfg.d/01-egz-slim /etc/dpkg/dpkg.cfg.d/01-egz-slim

# Packages a student meets at the INF.02 exam (list = vm-image/packages.txt).
COPY packages.txt /usr/local/share/egz/packages.txt
RUN apt-get update \
 && apt-get install -y --no-install-recommends $(grep -v '^#' /usr/local/share/egz/packages.txt) \
 && apt-get clean

# Offline "repository": the .deb of every exam package, so that
# `apt purge samba && apt install samba` still works without internet.
# Dependencies stay installed; only the top-level packages are kept.
RUN apt-get install -y --no-install-recommends apt-utils \
 && mkdir -p /var/lib/egz-repo && cd /var/lib/egz-repo && chown _apt /var/lib/egz-repo \
 && apt-get download $(grep -v '^#' /usr/local/share/egz/packages.txt) \
 && chown -R root:root /var/lib/egz-repo \
 && apt-ftparchive packages . > Packages \
 && echo 'deb [trusted=yes] file:/var/lib/egz-repo ./' > /etc/apt/sources.list.d/egz-offline.list \
 && apt-get update \
 && apt-get clean \
 && rm -f /var/lib/apt/lists/deb.debian.org_*

# Exam accounts: administrator / ZAQ!2wsx (sudo), root has the same password.
# (/etc/hostname and /etc/hosts are bind-mounted by Docker during the build;
# build-ext2.sh writes them from final/ into the exported filesystem.)
RUN useradd -m -s /bin/bash -c 'Administrator' -G sudo,adm administrator \
 && echo 'administrator:ZAQ!2wsx' | chpasswd \
 && echo 'root:ZAQ!2wsx' | chpasswd

# Shims (systemctl, service, journalctl, netplan, hostnamectl, apt wrapper),
# netplan template, MOTD, sudoers, prompt.
COPY rootfs/ /
RUN /usr/local/lib/egz/setup.sh

WORKDIR /home/administrator
ENV HOME="/home/administrator" TERM="xterm" USER="administrator" SHELL="/bin/bash" LANG="C.UTF-8"
CMD ["/usr/local/sbin/egz-login"]
