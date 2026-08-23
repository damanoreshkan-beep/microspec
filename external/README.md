# external/ — companion projects

Submodules here are **companion projects**, not runtime dependencies of the farm. The microspec runtime is a
zero-build Deno / web-PWA stack; it does not import native code. These live here so the farm references them
in one place and they version together.

## rtl8852au-userspace

No-root userspace Wi-Fi driver for the Realtek RTL8852AU (ASUS USB-AX56) on Android — monitor mode over
`libusb`, no kernel module. A native Android NDK + Termux project.

- Repo: https://github.com/damanoreshkan-beep/rtl8852au-userspace
- It is **not** importable by a microspec PWA (WebUSB cannot do the storage→wifi mode switch or the usbfs
  interface claim this hardware needs). A farm app could only ever talk to it through a local Termux bridge,
  not as a code dependency. It is linked here as a submodule for reference and shared versioning.

Pull it after cloning:

```bash
git submodule update --init external/rtl8852au-userspace
```
