"""Durability helper (S4b-a review M1). `os.replace` is atomic (whole-old or whole-new), but the
rename's DURABILITY across a power cut isn't guaranteed until the containing directory is fsync'd — a
door node WILL lose power, and without this a just-pushed (e.g. credential-revoking) envelope / floor /
ack could silently revert on reboot. Best-effort: never raise (a platform without dir-fsync must not
break the write path)."""

import os


def fsync_dir(dirpath):
    try:
        fd = os.open(dirpath, os.O_DIRECTORY)
    except (OSError, AttributeError):
        return  # e.g. no O_DIRECTORY on this platform — best-effort
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)
