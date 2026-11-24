/*
 * net32-jail CMD [ARGS...]: run CMD so that 32-bit (i386) programs started
 * under it have no network at all; 64-bit programs (apt on the host) are not
 * affected. Used by build-rootfs.sh around mmdebstrap and the offline phase.
 *
 * Why: the GitHub runner's kernel executes i386 programs but its 32-bit
 * socket syscalls fail with ENOSYS. Most tools then just lack the network,
 * but shadow's groupadd/useradd/chpasswd abort ("Cannot open audit interface
 * - aborting.") unless socket() fails with EINVAL/EPROTONOSUPPORT/
 * EAFNOSUPPORT, i.e. "this kernel has no such thing". This seccomp filter
 * answers every i386 socket syscall with EAFNOSUPPORT before the kernel
 * looks at it, so the build behaves the same on the runner and on any
 * other machine, and proves nothing 32-bit needs the network.
 *
 * Build: cc -O2 -o net32-jail net32-jail.c   (amd64 host)
 */
#include <errno.h>
#include <stddef.h>
#include <stdio.h>
#include <unistd.h>
#include <sys/prctl.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>

#define NO_NET(nr) \
  BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, (nr), 0, 1), \
  BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EAFNOSUPPORT)

int main(int argc, char **argv)
{
  struct sock_filter filter[] = {
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_I386, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),      /* not i386 */
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
    NO_NET(102),                                       /* socketcall */
    /* i386: socket 359, socketpair, bind, connect, listen, accept4,
       getsockopt, setsockopt, getsockname, getpeername, sendto, sendmsg,
       recvfrom, recvmsg, shutdown 373 */
    NO_NET(359), NO_NET(360), NO_NET(361), NO_NET(362), NO_NET(363),
    NO_NET(364), NO_NET(365), NO_NET(366), NO_NET(367), NO_NET(368),
    NO_NET(369), NO_NET(370), NO_NET(371), NO_NET(372), NO_NET(373),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
  };
  struct sock_fprog prog = {
    .len = sizeof filter / sizeof filter[0],
    .filter = filter,
  };

  if (argc < 2) {
    fprintf(stderr, "usage: %s CMD [ARGS...]\n", argv[0]);
    return 2;
  }
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 ||
      prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog) != 0) {
    perror("net32-jail: seccomp");
    return 1;
  }
  execvp(argv[1], argv + 1);
  perror("net32-jail: exec");
  return 127;
}
