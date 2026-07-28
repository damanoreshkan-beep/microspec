
import { persistentAtom } from "@nanostores/persistent";

export const $shell = persistentAtom("ms:shell", "brick");

export const SHELLS = {
  
  brick: {
    label: "shellBrick",
    body: "sf-raised bg-base-100 rounded-[calc(var(--ms-r)*1.5)] w-full max-w-[26rem] p-[var(--ms-pad)]",
    screen: "sf-inset rounded-[var(--ms-r)] p-2",
    key: "square",
    deck: "split",
    pad: "cross",
  },

  
  pocket: {
    label: "shellPocket",
    body: "sf-raised bg-base-100 rounded-[2rem] w-full max-w-[22rem] p-[calc(var(--ms-pad)*1.25)]",
    screen: "sf-inset rounded-2xl p-3",
    key: "round",
    deck: "split",
    pad: "cross",
  },

  
  slab: {
    label: "shellSlab",
    body: "sf-raised bg-base-100 rounded-[1.25rem] w-full max-w-[30rem] p-[calc(var(--ms-pad)*0.6)]",
    screen: "sf-inset rounded-xl p-1",
    key: "round",
    deck: "split",
    pad: "cross",
  },

  
  wide: {
    label: "shellWide",
    body: "sf-raised bg-base-100 rounded-[2rem] w-full max-w-[40rem] p-[var(--ms-pad)]",
    screen: "sf-inset rounded-2xl p-2",
    key: "round",
    deck: "flank",
    pad: "cross",
  },

  
  arcade: {
    label: "shellArcade",
    body: "sf-raised bg-base-100 rounded-[0.75rem] w-full max-w-[28rem] p-[calc(var(--ms-pad)*1.4)]",
    screen: "sf-inset rounded-md p-3",
    key: "round",
    deck: "split",
    pad: "disc",
  },

  
  bare: {
    label: "shellBare",
    body: null,
    screen: "",
    key: "round",
    deck: "float",
    pad: "cross",
  },
};

export const SHELL_IDS = Object.keys(SHELLS);
export const shellOf = (id) => SHELLS[id] || SHELLS.brick;
