#!/usr/bin/python3
# Entry point for the exam VM's emulated network commands (see egznet.py).
# Kept tiny so that the real code is loaded from its precompiled .pyc.
import sys
sys.path.insert(0, "/usr/local/lib/egz")
import egznet  # noqa: E402
sys.exit(egznet.main(sys.argv[1:]))
