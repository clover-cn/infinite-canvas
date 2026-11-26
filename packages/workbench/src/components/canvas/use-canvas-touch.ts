import { useEffect, useLayoutEffect, useRef, type PointerEvent } from "react";
import type { Position } from "@infinite-canvas/shared/canvas/schema/canvas";
import type { ViewportTransform } from "@workbench/types/canvas";

export const CANVAS_TOUCH_EDGE = 16;
export const CANVAS_DRAG_SLOP = 3;
const PAN_DELAY = 40;
const SELECT_DELAY = 500;
export function isCanvasTouchEdge(clientX: number) {
    return clientX < CANVAS_TOUCH_EDGE || clientX >= window.innerWidth - CANVAS_TOUCH_EDGE;
}

export type CanvasSelectionStart = Pick<PointerEvent, "button" | "clientX" | "clientY" | "pointerId" | "shiftKey">;

type TouchGesture = {
    surface: HTMLDivElement;
    id: number;
    start: Position;
    point: Position;
    viewport: ViewportTransform;
    mode: "waiting" | "pan" | "select" | "pinch" | "after-pinch";
    moved: boolean;
    panTimer?: number;
    selectTimer?: number;
    second?: { id: number; point: Position };
    pinch?: { distance: number; anchor: Position };
};

function stopTimers(gesture: TouchGesture) {
    window.clearTimeout(gesture.panTimer);
    window.clearTimeout(gesture.selectTimer);
}

function midpoint(a: Position, b: Position, surface: HTMLDivElement) {
    const rect = surface.getBoundingClientRect();
    return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
}

export function useCanvasTouch(
    viewport: ViewportTransform,
    onViewportChange: (next: ViewportTransform) => void,
    onSelectStart?: (event: CanvasSelectionStart) => void,
    onSelectCancel?: (id: number) => void,
    onDeselect?: () => void,
) {
    const gestureRef = useRef<TouchGesture | null>(null);
    const viewportRef = useRef(viewport);
    const pending = useRef<ViewportTransform | null>(null);
    const frame = useRef<number | null>(null);
    const callbacks = useRef({ onViewportChange, onSelectStart, onSelectCancel, onDeselect });

    useLayoutEffect(() => {
        callbacks.current = { onViewportChange, onSelectStart, onSelectCancel, onDeselect };
    }, [onViewportChange, onSelectStart, onSelectCancel, onDeselect]);
    useLayoutEffect(() => { viewportRef.current = viewport; }, [viewport]);

    function update(next: ViewportTransform) {
        pending.current = next;
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = null;
            if (!pending.current) return;
            viewportRef.current = pending.current;
            pending.current = null;
            callbacks.current.onViewportChange(viewportRef.current);
        });
    }

    function pan(gesture: TouchGesture) {
        update({
            x: gesture.viewport.x + gesture.point.x - gesture.start.x,
            y: gesture.viewport.y + gesture.point.y - gesture.start.y,
            k: gesture.viewport.k,
        });
    }

    function clear(cancelled: boolean) {
        const gesture = gestureRef.current;
        if (!gesture) return;
        gestureRef.current = null;
        gesture.surface.removeAttribute("data-canvas-touch-active");
        stopTimers(gesture);
        if (cancelled) {
            if (gesture.mode === "select") callbacks.current.onSelectCancel?.(gesture.id);
            if (frame.current !== null) cancelAnimationFrame(frame.current);
            frame.current = null;
            pending.current = null;
        }
        for (const id of [gesture.id, gesture.second?.id]) {
            if (id !== undefined && gesture.surface.hasPointerCapture(id)) gesture.surface.releasePointerCapture(id);
        }
    }

    useEffect(() => {
        const cancel = () => clear(true);
        window.addEventListener("blur", cancel);
        return () => {
            window.removeEventListener("blur", cancel);
            clear(false);
            if (frame.current !== null) cancelAnimationFrame(frame.current);
            frame.current = null;
            pending.current = null;
        };
    }, []);

    function start(event: PointerEvent<HTMLDivElement>, background: boolean) {
        if (event.pointerType !== "touch" || event.button !== 0) return false;
        if (isCanvasTouchEdge(event.clientX)) return false;
        const point = { x: event.clientX, y: event.clientY };
        const gesture = gestureRef.current;
        if (gesture) {
            if (gesture.second || gesture.id === event.pointerId) return false;
            stopTimers(gesture);
            if (gesture.mode === "select") callbacks.current.onSelectCancel?.(gesture.id);
            gesture.viewport = pending.current ?? viewportRef.current;
            gesture.mode = "pinch";
            gesture.second = { id: event.pointerId, point };
            const center = midpoint(gesture.point, point, gesture.surface);
            const { x, y, k } = gesture.viewport;
            gesture.pinch = {
                distance: Math.max(1, Math.hypot(gesture.point.x - point.x, gesture.point.y - point.y)),
                anchor: { x: (center.x - x) / k, y: (center.y - y) / k },
            };
            gesture.surface.setPointerCapture(event.pointerId);
            return true;
        }
        if (!background || !event.isPrimary) return false;
        const first: TouchGesture = {
            surface: event.currentTarget, id: event.pointerId, start: point, point,
            viewport: pending.current ?? viewportRef.current, mode: "waiting", moved: false,
        };
        gestureRef.current = first;
        // 第一指留在画布时接管后续触点，松手后交回节点和编辑器。
        first.surface.setAttribute("data-canvas-touch-active", "");
        first.surface.setPointerCapture(first.id);
        first.panTimer = window.setTimeout(() => {
            first.mode = "pan";
            if (first.moved) pan(first);
        }, PAN_DELAY);
        first.selectTimer = window.setTimeout(() => {
            if (!callbacks.current.onSelectStart) return;
            first.mode = "select";
            callbacks.current.onSelectStart({ clientX: first.start.x, clientY: first.start.y, button: 0, shiftKey: false, pointerId: first.id });
        }, SELECT_DELAY);
        return true;
    }

    function move(event: PointerEvent<HTMLDivElement>) {
        const gesture = gestureRef.current;
        if (!gesture) return;
        const point = { x: event.clientX, y: event.clientY };
        if (event.pointerId === gesture.id) gesture.point = point;
        else if (gesture.second?.id === event.pointerId) gesture.second.point = point;
        else return;

        if (gesture.second && gesture.pinch) {
            const other = gesture.second.point;
            const center = midpoint(gesture.point, other, gesture.surface);
            const distance = Math.hypot(gesture.point.x - other.x, gesture.point.y - other.y);
            const k = Math.min(5, Math.max(0.05, gesture.viewport.k * distance / gesture.pinch.distance));
            update({ x: center.x - gesture.pinch.anchor.x * k, y: center.y - gesture.pinch.anchor.y * k, k });
            return;
        }

        if (gesture.mode !== "waiting" && gesture.mode !== "pan" && gesture.mode !== "after-pinch") return;
        if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > CANVAS_DRAG_SLOP) {
            gesture.moved = true;
            window.clearTimeout(gesture.selectTimer);
        }
        if (gesture.moved && gesture.mode !== "waiting") pan(gesture);
    }

    function end(event: PointerEvent<HTMLDivElement>, cancelled = false) {
        const gesture = gestureRef.current;
        if (!gesture || (gesture.id !== event.pointerId && gesture.second?.id !== event.pointerId)) return;
        if (!cancelled) {
            move(event);
            if (gesture.mode === "waiting" && gesture.moved) pan(gesture);
        }
        if (cancelled || !gesture.second) {
            clear(cancelled);
            if (!cancelled && !gesture.moved && (gesture.mode === "pan" || gesture.mode === "waiting")) callbacks.current.onDeselect?.();
            return;
        }
        if (gesture.id === event.pointerId) {
            gesture.id = gesture.second.id;
            gesture.point = gesture.second.point;
        }
        gesture.second = undefined;
        gesture.pinch = undefined;
        gesture.mode = "after-pinch";
        gesture.start = gesture.point;
        gesture.viewport = pending.current ?? viewportRef.current;
        gesture.moved = false;
    }

    return { start, move, end };
}
