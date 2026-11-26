import { useSyncExternalStore } from "react";
import { network } from "@workbench/services/network/runtime";

const mobileInput = "(pointer: coarse) and (hover: none)";

function subscribe(onChange: () => void) {
    if (network.kind !== "browser") return () => {};
    const query = window.matchMedia(mobileInput);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

function isMobileWeb() {
    return network.kind === "browser" && window.matchMedia(mobileInput).matches;
}

export function useMobileWeb() {
    return useSyncExternalStore(subscribe, isMobileWeb, () => false);
}
