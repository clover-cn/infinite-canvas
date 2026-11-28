import { models } from "@workbench/services/api/models/runtime";
import { PluginPanels } from "@workbench/components/plugins/plugin-contributions";
import { getPluginErrorMessage, PluginError } from "@infinite-canvas/shared/plugins";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type SetStateAction } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Group, LoaderCircle, Video } from "lucide-react";
import mime from "mime";

import { useConfigStore } from "@workbench/stores/use-config-store";
import { nanoid } from "nanoid";
import { canvasThemes } from "@workbench/lib/canvas-theme";
import { useThemeStore } from "@workbench/stores/use-theme-store";
import { Button } from "@infinite-canvas/plugin-sdk/ui/button";
import { Dialog } from "radix-ui";
import { CanvasDialog } from "@workbench/components/canvas/canvas-dialog";
import { toast } from "sonner";
import { workbenchMessageOptions } from "@workbench/components/ui/sonner";
import { ActiveConnectionPath, ConnectionPath } from "@workbench/components/canvas/canvas-connections";
import { CanvasNodeContextMenu } from "@workbench/components/canvas/canvas-context-menu";
import { CanvasNodeHoverToolbar, CanvasNodeInfoModal } from "@workbench/components/canvas/canvas-node-hover-toolbar";
import { CanvasSelectionToolbar } from "@workbench/components/canvas/canvas-selection-toolbar";
import { InfiniteCanvas } from "@workbench/components/canvas/infinite-canvas";
import { CANVAS_DRAG_SLOP, isCanvasTouchEdge, type CanvasSelectionStart } from "@workbench/components/canvas/use-canvas-touch";
import { Minimap } from "@workbench/components/canvas/canvas-mini-map";
import { CanvasNode } from "@workbench/components/canvas/canvas-node";
import { CanvasToolbar } from "@workbench/components/canvas/canvas-toolbar";
import { AssetPickerModal } from "@workbench/components/canvas/asset-picker-modal";
import { CanvasSidePanel } from "@workbench/components/canvas/canvas-side-panel";
import { CanvasHoverPreview } from "@workbench/components/canvas/canvas-hover-preview";
import { CanvasChrome } from "@workbench/components/canvas/canvas-chrome";
import { useCanvasStore, type CanvasProject } from "@workbench/stores/canvas/use-canvas-store";
import { useCanvasProjectActions } from "@workbench/hooks/use-canvas-project-actions";
import { CanvasSession } from "@workbench/lib/canvas/canvas-session";
import { canvasApply, canvasUndo, canvasRedo, canvasSelect, canvasViewport, canvasFocusNode, canvasDeleteNodes, canvasGroupNodes, canvasUngroupNodes, commands, nodePreviewImage, canvasImportMedia, canvasInsertAsset } from "@infinite-canvas/plugin-sdk/builtin";
import type { CanvasAssetInput, CommandContext, PluginCommand } from "@infinite-canvas/plugin-sdk";
import { executeCommand } from "@workbench/lib/plugins/commands";
import { registerChangedCanvasAssets } from "@workbench/lib/canvas/register-canvas-asset";
import { builtinPlugin, pluginRegistry, workspaceBinding } from "@workbench/lib/plugins/registry";
import { readImageBlob } from "@workbench/services/image-storage";
import { readMediaBlob } from "@workbench/services/file-storage";
import { saveDownload } from "@workbench/services/save-download";
import { readVideoPlayhead } from "@workbench/components/media-player";
import type { CanvasDocumentOp } from "@infinite-canvas/shared/canvas/ops/apply";
import { useAgentBridge } from "@workbench/pages/canvas/hooks/use-agent-bridge";
import { createNodePanelSelection, usePluginHost, type OpenNodePanel } from "@workbench/pages/canvas/hooks/use-plugin-host";
import { useNodeGeneration } from "@workbench/pages/canvas/hooks/use-node-generation";
import { useImageNodeEdits } from "@workbench/components/canvas/use-image-node-edits";
import { useImageNodeActions } from "@workbench/pages/canvas/hooks/use-image-node-actions";
import { useMediaPicker } from "@workbench/pages/canvas/hooks/use-media-picker";
import { useCanvasView } from "@workbench/pages/canvas/hooks/use-canvas-view";
import { useVideoFrameCapture } from "@workbench/pages/canvas/hooks/use-video-frame-capture";
import { useNodeInfo } from "@workbench/pages/canvas/hooks/use-node-info";
import { useCanvasClearConfirmation } from "@workbench/pages/canvas/hooks/use-canvas-clear-confirmation";
import { useCanvasProjectExport } from "@workbench/pages/canvas/hooks/use-canvas-project-export";
import { useCanvasProjectMenu } from "@workbench/pages/canvas/hooks/use-canvas-project-menu";
import { registerCanvasMediaImport } from "@workbench/lib/canvas/media-import";
import { registerCanvasAssetInsert } from "@workbench/lib/canvas/asset-insert";
import { registerCanvasNodeActions } from "@workbench/lib/canvas/node-actions";
import { registerCanvasNodeMenus } from "@workbench/lib/canvas/node-menus";
import { registerCanvasNodeCreation } from "@workbench/lib/canvas/node-creation";
import { registerCanvasCreationMenus } from "@workbench/lib/canvas/node-creation-menus";
import { bindHostActions, hostActions } from "@workbench/lib/canvas/host-actions";
import { registerCanvasClipboard } from "@workbench/lib/canvas/clipboard";
import { registerCanvasClear } from "@workbench/lib/canvas/canvas-clear";
import { registerCanvasViewCommands } from "@workbench/lib/canvas/canvas-view-commands";
import { getGroupResourceNodes, getNodeMediaResource, isCanvasReferenceNode } from "@workbench/lib/canvas/canvas-resource-references";
import { canvasNeighbors } from "@workbench/lib/canvas/graph-index";
import { canGroupSelectedNodes, canUngroupSelectedNodes, findContainingGroupId, findGroupDropTarget, snapNodesIntoGroup } from "@infinite-canvas/shared/canvas/ops/groups";
import { CANVAS_NODE_DETAIL_SCALE, getConnectionTargetAnchor, normalizeConnection } from "@workbench/lib/canvas/canvas-node-geometry";
import {
    audioExtension,
    imageExtension,
    isAudioFile,
    resetInterruptedGeneration,
} from "@workbench/lib/canvas/canvas-generation-helpers";
import { getNodeDefinition, useNodeRegistryVersion } from "@workbench/lib/canvas/node-registry";
import { registerBuiltinNodes } from "@workbench/components/canvas/nodes/builtin-nodes";
import { CanvasRefreshShell } from "@workbench/components/canvas/canvas-refresh-shell";
import { ConnectionCreateMenu, NodeCreateMenu, type PendingConnectionCreate } from "@workbench/components/canvas/canvas-create-menus";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "@infinite-canvas/shared/canvas/schema/canvas";
import { type ConnectionHandle, type ContextMenuState, type SelectionBox, type ViewportTransform } from "@workbench/types/canvas";
import { pasteSystemClipboard } from "./clipboard";

// Register built-in nodes in the shared registry once when the module loads.
registerBuiltinNodes();

type ConnectionDropTarget = {
    nodeId: string | null;
    isNearNode: boolean;
};

type ConnectionGesture = {
    id: number;
    handle: ConnectionHandle;
    start: Position;
    dragging: boolean;
};

type ImagePreviewRecord = { nodeId: string; title: string; url?: string; close: () => void };

const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;

function hasDragged(startX: number, startY: number, endX: number, endY: number) {
    return Math.hypot(endX - startX, endY - startY) > CANVAS_DRAG_SLOP;
}

export default function CanvasPage() {
    const { id: projectId = "" } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const hydrated = useCanvasStore((state) => state.hydrated);
    const reloadVersion = useCanvasStore((state) => state.reloads[projectId] ?? 0);
    const deletionStatus = useCanvasStore((state) => state.projectDeletions[projectId]);
    const exists = useCanvasStore((state) => state.projects.some((project) => project.id === projectId));
    const { deleteProjects } = useCanvasProjectActions(`canvas-deletion:${projectId}`);
    const [opened, setOpened] = useState<{ project: CanvasProject; session: CanvasSession; reloadVersion: number } | null>(null);
    useEffect(() => {
        if (!hydrated || deletionStatus) return;
        const project = useCanvasStore.getState().openProject(projectId);
        if (!project) { navigate("/canvas", { replace: true }); return; }
        const nodes = resetInterruptedGeneration(project.nodes, projectId, Boolean(models.tasks));
        const restored = { ...project, nodes };
        if (nodes.some((node, i) => node !== project.nodes[i])) useCanvasStore.getState().updateProject(projectId, { nodes });
        const session = new CanvasSession({ project: restored, store: useCanvasStore.getState() });
        const unsubscribe = useCanvasStore.subscribe((state) => {
            if (state.projectDeletions[projectId]) void session.close().catch((error) => console.error("画布退出保存失败", error));
        });
        setOpened({ project: restored, session, reloadVersion });
        return () => { unsubscribe(); void session.close().catch((error) => console.error("画布退出保存失败", error)); };
    }, [deletionStatus, exists, hydrated, navigate, projectId, reloadVersion]);
    if (deletionStatus) return (
        <main className="flex h-full flex-col items-center justify-center gap-4 bg-background text-foreground">
            <p role="status">{deletionStatus === "pending" ? "正在删除画布…" : "画布尚未删除完成，请重试。"}</p>
            <div className="flex gap-2">
                {deletionStatus === "error" && <Button variant="outline" size="sm" className="text-destructive" onClick={() => void deleteProjects([projectId])}>重试删除</Button>}
                <Button variant="outline" size="sm" onClick={() => navigate("/canvas")}>返回画布列表</Button>
            </div>
        </main>
    );
    if (!exists || !opened || opened.project.id !== projectId || opened.reloadVersion !== reloadVersion || opened.session.signal.aborted) return <CanvasRefreshShell />;
    return <InfiniteCanvasPage key={`${projectId}:${reloadVersion}`} project={opened.project} session={opened.session} />;
}

function InfiniteCanvasPage({ project, session }: { project: CanvasProject; session: CanvasSession }) {
    const commandOptions = useMemo(() => ({ session, scope: Object.freeze({ ...workspaceBinding, kind: "project" as const, projectId: session.projectId, signal: session.signal }), source: { kind: "ui" as const } }), [session]);
    const commitCanvas = useCallback((ops: CanvasDocumentOp[], nodeIds?: string[]) => {
        const pending = executeCommand(canvasApply, { ops, ...(nodeIds ? { selection: { nodeIds, connectionId: null } } : {}) }, commandOptions);
        void pending.catch((error) => { if (!session.signal.aborted) void toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error); });
        return pending;
    }, [commandOptions, session]);

    // Subscribe to the registry version so plugin registration changes rerender the canvas.
    const nodeRegistryVersion = useNodeRegistryVersion((state) => state.version);
    const projectId = project.id;
    const containerRef = useRef<HTMLDivElement>(null);
    const hasCanvasClipboard = useRef(false);
    const previewRef = useRef<ReturnType<CanvasSession["beginPreview"]> | null>(null);
    const rafRef = useRef<number | null>(null);
    const nodeDraggingRef = useRef(false);
    const dragRef = useRef<{
        isDraggingNode: boolean;
        pointerId: number | null;
        hasMoved: boolean;
        startX: number;
        startY: number;
        // Keyed by node id so drag frames look positions up in O(1) instead of scanning the array per node.
        initialSelectedNodes: Map<string, { x: number; y: number }>;
        movedIds: Set<string>;
    }>({
        isDraggingNode: false,
        pointerId: null,
        hasMoved: false,
        startX: 0,
        startY: 0,
        initialSelectedNodes: new Map(),
        movedIds: new Set(),
    });

    const currentProject = useCanvasStore((state) => state.projects.find((project) => project.id === projectId));
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
    const { nodes, connections, viewport } = snapshot;
    const setNodes = useCallback((value: SetStateAction<CanvasNodeData[]>) => {
        const document = session.getSnapshot();
        void commitCanvas([{ type: "replace_graph", graph: { nodes: typeof value === "function" ? value(document.nodes) : value, connections: document.connections } }]);
    }, [commitCanvas, session]);
    const setViewport = useCallback((value: SetStateAction<ViewportTransform>) => {
        void executeCommand(canvasViewport, typeof value === "function" ? value(session.getSnapshot().viewport) : value, commandOptions).catch((error) => { if (!session.signal.aborted) void toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error); });
    }, [commandOptions, session]);
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const selectedNodeIds = useMemo(() => new Set(snapshot.selection.nodeIds), [snapshot.selection.nodeIds]);
    const selectedConnectionId = snapshot.selection.connectionId;
    const setSelectedNodeIds = useCallback((value: SetStateAction<Set<string>>) => {
        const selection = session.getSnapshot().selection;
        const ids = typeof value === "function" ? value(new Set(selection.nodeIds)) : value;
        void executeCommand(canvasSelect, { ...selection, nodeIds: [...ids] }, commandOptions).catch((error) => { if (!session.signal.aborted) void toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error); });
    }, [commandOptions, session]);
    const setSelectedConnectionId = useCallback((value: SetStateAction<string | null>) => {
        const selection = session.getSnapshot().selection;
        void executeCommand(canvasSelect, { ...selection, connectionId: typeof value === "function" ? value(selection.connectionId) : value }, commandOptions).catch((error) => { if (!session.signal.aborted) void toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error); });
    }, [commandOptions, session]);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [portSelectionActive, setPortSelectionActive] = useState(false);
    const connectionGesture = useRef<ConnectionGesture | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const { view, hoverNodeId, canvasTool, isMiniMapOpen } = useCanvasView(session, containerRef, setContextMenu);
    useLayoutEffect(() => view ? registerCanvasViewCommands(session, view) : undefined, [session, view]);
    const [nodeCreatePosition, setNodeCreatePosition] = useState<Position | null>(null);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [imageSettingsOwner, setImageSettingsOwner] = useState<AbortSignal | null>(null);
    const nodeImageSettingsOpen = imageSettingsOwner !== null && !imageSettingsOwner.aborted;
    const [dialogPanel, setDialogPanel] = useState<OpenNodePanel | null>(null);
    const dialogNodeId = dialogPanel?.nodeId;
    const { setNodeId: setDialogNodeId, capture: capturePanel } = useMemo(() => createNodePanelSelection(session, setDialogPanel), [session]);
    const nodeInfo = useNodeInfo(session);
    const clearConfirmation = useCanvasClearConfirmation(session);
    const [imagePreview, setImagePreview] = useState<ImagePreviewRecord | null>(null);
    const imagePreviewRef = useRef<ImagePreviewRecord | null>(null);
    const [expandedBatchNodeIds, setExpandedBatchNodeIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [isNodeResizing, setIsNodeResizing] = useState(false);
    const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
    const [referencePickerNodeId, setReferencePickerNodeId] = useState<string | null>(null);
    const { stopConfirmation, setRunningNodeId, isGenerating, generationRequestsRef } = useNodeGeneration(session, { setDialogNodeId, capturePanel, setReferencePickerNodeId, setExpandedBatchNodeIds });
    const imageEditors = useImageNodeEdits(session, setDialogNodeId);
    useImageNodeActions(session);
    useLayoutEffect(() => registerCanvasMediaImport(session, generationRequestsRef.current), [session, generationRequestsRef]);
    useLayoutEffect(() => registerCanvasAssetInsert(session), [session]);
    useLayoutEffect(() => registerCanvasNodeActions(session, (nodeIds) => {
        setToolbarNodeId(nodeIds.length === 1 ? nodeIds[0] : null);
        setDialogNodeId(null);
        setContextMenu(null);
    }), [session]);
    useLayoutEffect(() => registerCanvasNodeMenus(session), [session]);
    useLayoutEffect(() => registerCanvasNodeCreation(session), [session]);
    useLayoutEffect(() => registerCanvasClipboard(session, (available) => { hasCanvasClipboard.current = available; }), [session]);
    useLayoutEffect(() => session.on("document.committed", () => {
        const currentSnapshot = session.getSnapshot();
        const ids = new Set(currentSnapshot.nodes.map((node) => node.id));
        for (const setTarget of [setHoveredNodeId, setToolbarNodeId, setDialogNodeId, setReferencePickerNodeId, setRunningNodeId]) {
            setTarget((current) => current && !ids.has(current) ? null : current);
        }
        setExpandedBatchNodeIds((current) => [...current].some((id) => !ids.has(id)) ? new Set([...current].filter((id) => ids.has(id))) : current);
        setContextMenu((current) => {
            if (current?.type === "node" && !ids.has(current.nodeId)) return null;
            if (current?.type === "connection" && !currentSnapshot.connections.some((edge) => edge.id === current.connectionId)) return null;
            return current;
        });
    }), [session, setRunningNodeId]);

    const nodesRef = useMemo(() => ({ get current() { return session.getSnapshot().nodes; } }), [session]);

    useLayoutEffect(() => {
        const reads = new Set<() => void>();
        const resolve = ({ nodeId, slotId }: { nodeId: string; slotId?: string }, context: CommandContext) => {
            context.signal.throwIfAborted();
            if (session.signal.aborted || context.canvas?.projectId !== session.projectId) throw new PluginError("PLUGIN_PROJECT_CHANGED");
            const node = context.canvas.getNodes().find((item) => item.id === nodeId);
            if (!node) throw new PluginError("PLUGIN_NOT_FOUND");
            const media = getNodeMediaResource(node, slotId, context.scope, "execute");
            if (!media) throw new PluginError("PLUGIN_NOT_FOUND");
            media.signal.throwIfAborted();
            return { node, media };
        };
        const capture = (input: { nodeId: string; slotId?: string }, context: CommandContext) => {
            const { node, media } = resolve(input, context);
            const controller = new AbortController();
            const signal = AbortSignal.any([context.signal, session.signal, media.signal, controller.signal]);
            signal.throwIfAborted();
            const check = () => {
                if (signal.aborted) return;
                try {
                    const current = resolve(input, context).media;
                    if (current.signal !== media.signal || current.kind !== media.kind || current.storageKey !== media.storageKey || current.url !== media.url) controller.abort(new PluginError("PLUGIN_NOT_FOUND"));
                } catch (error) { controller.abort(error); }
            };
            const unsubscribe = session.subscribe(check);
            const unsubscribeRegistry = pluginRegistry.subscribeAll(check);
            const release = () => { unsubscribe(); unsubscribeRegistry(); signal.removeEventListener("abort", release); reads.delete(close); };
            const close = () => { release(); controller.abort(new PluginError("PLUGIN_SCOPE_CLOSED")); };
            signal.addEventListener("abort", release, { once: true });
            reads.add(close);
            return { node, media, signal, close };
        };
        const contributions: PluginCommand<{ nodeId: string; slotId?: string }, void>[] = [
            { command: nodePreviewImage, title: "预览图片", enabled: (input, context) => resolve(input, context).media.kind === "image", run: async (input, context) => {
                const access = capture(input, context);
                if (access.media.kind !== "image") { access.close(); throw new PluginError("PLUGIN_NOT_FOUND"); }
                let closed = false;
                const record: ImagePreviewRecord = { nodeId: input.nodeId, title: access.node.title || "图片", close: () => {
                    if (closed) return;
                    closed = true;
                    access.signal.removeEventListener("abort", record.close);
                    access.close();
                    if (record.url) URL.revokeObjectURL(record.url);
                    if (imagePreviewRef.current === record) { imagePreviewRef.current = null; setImagePreview(null); }
                } };
                const previous = imagePreviewRef.current;
                imagePreviewRef.current = record;
                previous?.close();
                access.signal.addEventListener("abort", record.close, { once: true });
                setImagePreview(record);
                try {
                    const blob = await readImageBlob(access.media.storageKey, access.media.url, { signal: access.signal });
                    access.signal.throwIfAborted();
                    record.url = URL.createObjectURL(blob);
                    setImagePreview({ ...record });
                } catch (error) { record.close(); throw error; }
            } },
        ];
        const disposers: (() => void)[] = [bindHostActions(session, { nodeDownloadResource: async (input, context) => {
            const access = capture(input, context);
            try {
                const { node, media, signal } = access;
                const blob = media.kind === "image" ? await readImageBlob(media.storageKey, media.url, { signal }) : await readMediaBlob(media.storageKey, media.url, { signal });
                signal.throwIfAborted();
                const mimeType = blob.type || node.metadata?.mimeType;
                const extension = mime.getExtension(mimeType || "") || (media.kind === "video" ? "mp4" : media.kind === "audio" ? audioExtension(mimeType) : imageExtension(blob.type));
                const name = `canvas-${media.kind}-${node.id}${input.slotId !== undefined ? `-${input.slotId}` : ""}.${extension}`;
                if (await saveDownload(blob, name, signal)) toast.success("文件已保存到下载目录的无限画布文件夹。", workbenchMessageOptions.success);
            } finally { access.close(); }
        } })];
        const release = () => { for (const dispose of disposers) dispose(); for (const close of [...reads]) close(); imagePreviewRef.current?.close(); };
        try { for (const value of contributions) disposers.push(builtinPlugin.extensions.contribute(commands, { id: value.command.id, value })); }
        catch (error) { release(); throw error; }
        return release;
    }, [session]);

    const connectionsRef = useMemo(() => ({ get current() { return session.getSnapshot().connections; } }), [session]);
    const selectedNodeIdsRef = useMemo(() => ({ get current() { return new Set(session.getSnapshot().selection.nodeIds); } }), [session]);
    const viewportRef = useMemo(() => ({ get current() { return session.getSnapshot().viewport; } }), [session]);
    const connectingParamsRef = useRef(connectingParams);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const selectionBoxRef = useRef(selectionBox);
    const selectionPointer = useRef<{ id: number; nodeIds: string[]; connectionId: string | null } | null>(null);
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
    useLayoutEffect(() => {
        connectingParamsRef.current = connectingParams;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
    }, [connectingParams, connectionTargetNodeId, pendingConnectionCreate]);

    useLayoutEffect(() => {
        selectionBoxRef.current = selectionBox;
    }, [selectionBox]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, []);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        const localX = clientX - (rect?.left || 0);
        const localY = clientY - (rect?.top || 0);

        return {
            x: (localX - currentViewport.x) / currentViewport.k,
            y: (localY - currentViewport.y) / currentViewport.k,
        };
    }, []);

    const getCanvasCenter = view?.getCenter;

    useCanvasProjectMenu(session);
    useCanvasProjectExport(session);
    useMediaPicker(session, getCanvasCenter);
    useLayoutEffect(() => getCanvasCenter ? registerCanvasCreationMenus(session, getCanvasCenter) : undefined, [session, getCanvasCenter]);
    useVideoFrameCapture(session, (nodeId, resource) => {
        session.signal.throwIfAborted();
        const video = containerRef.current && Array.from(containerRef.current.querySelectorAll<HTMLVideoElement>("video[data-canvas-video]")).find((item) => item.dataset.canvasVideo === nodeId);
        return readVideoPlayhead(video ?? null, projectId, nodeId, resource);
    });

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionGesture.current = null;
            setPortSelectionActive(false);
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen || !selectedNodeIdsRef.current.has(nodeId)) return;
            setToolbarNodeId(nodeId);
        },
        [nodeImageSettingsOpen],
    );

    const hideNodeToolbar = useCallback(() => {}, []);

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string) => {
            if (current.nodeId === targetNodeId) return;

            const connection = normalizeConnection(current.nodeId, targetNodeId, nodesRef.current, current.handleType);
            if (!connection) {
                toast.warning("组只能作为连线的起点", workbenchMessageOptions.warning);
                return;
            }
            const { fromNodeId, toNodeId } = connection;
            const exists = connectionsRef.current.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId);
            if (!exists) {
                void commitCanvas([{ type: "connect_nodes", connection: { id: nanoid(), fromNodeId, toNodeId } }]);
            }
            setContextMenu(null);
        },
        [commitCanvas],
    );

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        setConnecting(null);
    }, [setConnecting]);

    const getConnectionDropTarget = useCallback(
        (clientX: number, clientY: number, current: ConnectionHandle): ConnectionDropTarget => {
            const world = screenToCanvas(clientX, clientY);
            const scale = Math.max(viewportRef.current.k, 0.05);
            const padding = CONNECTION_NODE_HIT_PADDING / scale;
            const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
            let isNearNode = false;
            let bestNodeId: string | null = null;
            let bestPriority = Number.POSITIVE_INFINITY;

            [...nodesRef.current]
                .reverse()
                .forEach((node) => {
                    const anchor = getConnectionTargetAnchor(node, current);
                    const dx = world.x - anchor.x;
                    const dy = world.y - anchor.y;
                    const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
                    const hitsInside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
                    const hitsExpanded = world.x >= node.position.x - padding && world.x <= node.position.x + node.width + padding && world.y >= node.position.y - padding && world.y <= node.position.y + node.height + padding;

                    if (!hitsHandle && !hitsInside && !hitsExpanded) return;
                    isNearNode = true;
                    if (node.id === current.nodeId || !normalizeConnection(current.nodeId, node.id, nodesRef.current, current.handleType)) return;

                    const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
                    if (priority < bestPriority) {
                        bestNodeId = node.id;
                        bestPriority = priority;
                    }
                });

            return { nodeId: bestNodeId, isNearNode };
        },
        [screenToCanvas],
    );

    const viewBounds = useMemo(() => {
        const padding = 280;
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const left = -viewport.x / viewport.k - padding;
        const top = -viewport.y / viewport.k - padding;
        return { left, top, right: left + width / viewport.k + padding * 2, bottom: top + height / viewport.k + padding * 2 };
        // `nodes` keeps the container rect re-read on node changes, matching the previous behaviour when the container resizes without a size update.
    }, [nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

    const visibleNodes = useMemo(
        () => nodes.filter((node) => node.position.x + node.width > viewBounds.left && node.position.x < viewBounds.right && node.position.y + node.height > viewBounds.top && node.position.y < viewBounds.bottom),
        [nodes, viewBounds],
    );

    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const connectedPortTargets = useMemo(() => {
        if (!portSelectionActive || !connectingParams) return null;
        return new Set(connections.filter((edge) => edge.fromNodeId === connectingParams.nodeId).map((edge) => edge.toNodeId));
    }, [connectingParams, connections, portSelectionActive]);

    // Connections are culled like nodes; a cubic curve stays inside its control-point hull, so endpoint bounds widened by the curvature is a safe test.
    const visibleConnections = useMemo(
        () =>
            connections.flatMap((connection) => {
                const from = nodeById.get(connection.fromNodeId);
                const to = nodeById.get(connection.toNodeId);
                if (!from || !to) return [];
                const startX = from.position.x + from.width;
                const startY = from.position.y + from.height / 2;
                const endX = to.position.x;
                const endY = to.position.y + to.height / 2;
                const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
                const inView =
                    Math.max(startX + curvature, endX) > viewBounds.left && Math.min(startX, endX - curvature) < viewBounds.right && Math.max(startY, endY) > viewBounds.top && Math.min(startY, endY) < viewBounds.bottom;
                return inView ? [{ connection, from, to }] : [];
            }),
        [connections, nodeById, viewBounds],
    );
    // The toolbar follows a single selected node selected by click, creation, marquee, or keyboard.
    // It stays hidden for multi-selection and while isNodeDragging is true.
    const singleSelectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
    const toolbarNode = (toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null) || (singleSelectedNodeId ? nodeById.get(singleSelectedNodeId) || null : null);
    const panelNode = dialogNodeId ? nodeById.get(dialogNodeId) : undefined;
    const fullscreenNode = panelNode && getNodeDefinition(panelNode.type)?.panelPresentation === "fullscreen" ? panelNode : null;
    const inlinePanel = !fullscreenNode && !isNodeResizing && !selectionBox && panelNode && panelNode.type !== CanvasNodeType.Group && !getNodeDefinition(panelNode.type)?.hidePanel ? panelNode : null;
    const compactPanel = viewport.k < CANVAS_NODE_DETAIL_SCALE ? inlinePanel : null;
    const dockedPanel = !compactPanel && size.width < 640 ? inlinePanel : null;
    const infoNode = nodeInfo ? nodeById.get(nodeInfo.nodeId) || null : null;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const selectedNodes = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id)), [nodes, selectedNodeIds]);
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();

        if (!activeNodeId) return { nodeIds, connectionIds };

        const addNode = (nodeId: string) => {
            nodeIds.add(nodeId);
            if (nodeById.get(nodeId)?.type === CanvasNodeType.Group) nodes.forEach((node) => node.metadata?.groupId === nodeId && nodeIds.add(node.id));
        };
        addNode(activeNodeId);
        connections.forEach((connection) => {
            if (connection.fromNodeId !== activeNodeId && connection.toNodeId !== activeNodeId) return;
            connectionIds.add(connection.id);
            addNode(connection.fromNodeId);
            addNode(connection.toNodeId);
        });

        return { nodeIds, connectionIds };
    }, [activeNodeId, connections, nodeById, nodes]);

    const referenceConnectedNodeIds = useMemo(() => {
        if (!referencePickerNodeId) return null;
        const connected = new Set([referencePickerNodeId]);
        for (const node of canvasNeighbors({ nodes, connections }, referencePickerNodeId, "upstream", "connection")) {
            connected.add(node.id);
            if (node.type === CanvasNodeType.Group) {
                for (const child of getGroupResourceNodes(node.id, nodes)) connected.add(child.id);
            }
        }
        return connected;
    }, [nodes, connections, referencePickerNodeId]);
    useAgentBridge({
        session,
        title: currentProject?.title ?? project.title,
        setContextMenu,
    });

    const { pluginHost, renderPluginPanel, buildNodeToolbarItems } = usePluginHost({
        session,
        theme,
        dialogPanel,
        setDialogNodeId,
        isGenerating,
        expandedNodeIds: expandedBatchNodeIds,
        setExpandedNodeIds: setExpandedBatchNodeIds,
        onImageSettingsOpenChange: useCallback((owner: AbortSignal, open: boolean) => {
            if (open) { if (!owner.aborted) { setImageSettingsOwner(owner); setToolbarNodeId(null); } }
            else setImageSettingsOwner((current) => current === owner ? null : current);
        }, []),
    });
    const exitNodeReferenceSelection = useCallback(() => {
        if (!referencePickerNodeId) return;
        setSelectedNodeIds(new Set([referencePickerNodeId]));
        setDialogNodeId(referencePickerNodeId);
        setReferencePickerNodeId(null);
    }, [referencePickerNodeId]);

    const selectNodeReference = useCallback((fromNodeId: string) => {
        if (!referencePickerNodeId || referenceConnectedNodeIds?.has(fromNodeId)) return;
        const source = nodesRef.current.find((node) => node.id === fromNodeId);
        if (!source || !isCanvasReferenceNode(source, nodesRef.current)) return;
        void commitCanvas([{ type: "connect_nodes", connection: { id: nanoid(), fromNodeId, toNodeId: referencePickerNodeId } }]);
    }, [commitCanvas, nodesRef, referenceConnectedNodeIds, referencePickerNodeId]);

    useEffect(() => {
        if (!referencePickerNodeId) return;
        const exit = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            exitNodeReferenceSelection();
        };
        window.addEventListener("keydown", exit, true);
        return () => window.removeEventListener("keydown", exit, true);
    }, [exitNodeReferenceSelection, referencePickerNodeId]);

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
    }, [cancelPendingConnectionCreate]);

    const onCleared = useCallback(() => {
        cancelPendingConnectionCreate();
        setContextMenu(null);
        setSelectionBox(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setImagePreview(null);
        setRunningNodeId(null);
    }, [cancelPendingConnectionCreate, setRunningNodeId]);
    useLayoutEffect(() => registerCanvasClear(session, onCleared), [session, onCleared]);

    const copySelectedNodes = useCallback(async () => {
        const nodeIds = [...selectedNodeIdsRef.current];
        if (!nodeIds.length) return;
        try {
            await hostActions.canvasCopyToClipboard({ nodeIds });
        } catch (error) {
            if (!session.signal.aborted && !(error instanceof PluginError && error.code === "PLUGIN_SCOPE_CLOSED")) void toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error);
        }
    }, [commandOptions, session]);

    const pasteClipboard = useCallback(async () => {
        try {
            const position = getCanvasCenter!();
            if (hasCanvasClipboard.current) {
                const result = await hostActions.canvasPasteFromClipboard({ position });
                session.signal.throwIfAborted();
                setContextMenu(null);
                const first = result.nodes.find((node) => node.id === result.selection.nodeIds[0]);
                if (first?.type === CanvasNodeType.Group) setDialogNodeId(null);
                return;
            }
            const kind = await pasteSystemClipboard(session, commandOptions.scope, position);
            session.signal.throwIfAborted();
            if (kind === "text") {
                setContextMenu(null);
                void toast.success("已从剪切板添加文本", workbenchMessageOptions.success);
            } else if (kind === "image") void toast.success("已从剪切板添加图片", workbenchMessageOptions.success);
        } catch (error) {
            if (session.signal.aborted) return;
            console.error("[canvas] clipboard paste", error);
            void toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error);
        }
    }, [commandOptions, getCanvasCenter, session]);

    const focusNode = useCallback((nodeId: string) => {
        void executeCommand(canvasFocusNode, { nodeId }, commandOptions).catch((error) => {
            if (!session.signal.aborted && !(error instanceof PluginError && (error.code === "PLUGIN_INACTIVE" || error.code === "PLUGIN_NOT_FOUND"))) void toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error);
        });
    }, [commandOptions, session]);

    const undoCanvas = useCallback(() => {
        void executeCommand(canvasUndo, undefined, commandOptions).catch((error) => toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error));
        setContextMenu(null);
    }, [commandOptions]);

    const redoCanvas = useCallback(() => {
        void executeCommand(canvasRedo, undefined, commandOptions).catch((error) => toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error));
        setContextMenu(null);
    }, [commandOptions]);

    const handleCanvasSelectionStart = useCallback(
        (event: CanvasSelectionStart) => {
            if (event.button !== 0 || selectionPointer.current || nodeDraggingRef.current) return;
            const selection = session.getSnapshot().selection;
            selectionPointer.current = { id: event.pointerId, nodeIds: [...selection.nodeIds], connectionId: selection.connectionId };
            setContextMenu(null);
            setNodeCreatePosition(null);
            setHoveredNodeId(null);
            setToolbarNodeId(null);
            setDialogNodeId(null);
            if (connectingParamsRef.current || pendingConnectionCreateRef.current) cancelPendingConnectionCreate();

            const world = screenToCanvas(event.clientX, event.clientY);
            const nextSelectionBox = {
                startWorldX: world.x,
                startWorldY: world.y,
                currentWorldX: world.x,
                currentWorldY: world.y,
                additive: event.shiftKey,
                initialSelectedNodeIds: event.shiftKey ? Array.from(selectedNodeIdsRef.current) : [],
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!event.shiftKey) {
                setSelectedNodeIds(new Set());
            }

            setSelectedConnectionId(null);
        },
        [cancelPendingConnectionCreate, screenToCanvas, session],
    );

    const finishSelection = useCallback((pointerId: number | undefined, cancelled: boolean) => {
        const pointer = selectionPointer.current;
        if (!pointer || (pointerId !== undefined && pointerId !== pointer.id)) return;
        selectionPointer.current = null;
        selectionBoxRef.current = null;
        setSelectionBox(null);
        if (cancelled && !session.signal.aborted) {
            void executeCommand(canvasSelect, { nodeIds: pointer.nodeIds, connectionId: pointer.connectionId }, commandOptions)
                .catch((error) => { if (!session.signal.aborted) toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error); });
        }
    }, [commandOptions, session]);

    // Selection-only logic shared by the bubbling drag entry point and outer capture handler.
    // Returns the single target ID after the click, or null for multi-selection or deselection, to sync the toolbar.
    const selectNodeByEvent = useCallback((event: Pick<ReactMouseEvent, "shiftKey" | "metaKey" | "ctrlKey">, nodeId: string) => {
        const nextSelected = new Set(selectedNodeIdsRef.current);
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
            if (nextSelected.has(nodeId)) nextSelected.delete(nodeId);
            else nextSelected.add(nodeId);
        } else if (!nextSelected.has(nodeId)) {
            nextSelected.clear();
            nextSelected.add(nodeId);
        }
        setSelectedNodeIds(nextSelected);
        const soloId = nextSelected.size === 1 && nextSelected.has(nodeId) ? nodeId : null;
        setToolbarNodeId(soloId);
        return { nextSelected, soloId };
    }, []);

    // 鼠标点编辑器时只选中节点；正文开始拖动时复用选中结果，避免 Shift 重复切换选区。
    const pendingSelectionRef = useRef<Set<string> | null>(null);
    const handleNodeSelectCapture = useCallback(
        (event: ReactPointerEvent, nodeId: string) => {
            if (event.button !== 0 || (event.target instanceof Element && event.target.closest("[data-canvas-port],[data-canvas-extend]"))) return;
            setContextMenu(null);
            setHoveredNodeId(null);
            setSelectedConnectionId(null);
            const { nextSelected } = selectNodeByEvent(event, nodeId);
            pendingSelectionRef.current = event.pointerType === "mouse" ? nextSelected : null;
        },
        [selectNodeByEvent, setSelectedConnectionId],
    );

    const handleNodeDragStart = useCallback((event: ReactPointerEvent, nodeId: string) => {
        event.stopPropagation();
        const capturedSelection = event.pointerType === "mouse" ? pendingSelectionRef.current : null;
        pendingSelectionRef.current = null;
        if (dragRef.current.isDraggingNode || previewRef.current || selectionPointer.current || connectionGesture.current) return;
        if (!capturedSelection) {
            setContextMenu(null);
            setHoveredNodeId(null);
            setSelectedConnectionId(null);
        }
        const currentNodes = nodesRef.current;
        const nextSelected = capturedSelection ?? selectNodeByEvent(event, nodeId).nextSelected;
        if (!nextSelected.has(nodeId)) return;
        event.preventDefault();
        if (event.target instanceof Element) event.target.setPointerCapture(event.pointerId);
        const dragIds = new Set(nextSelected);
        currentNodes.forEach((node) => {
            if (!nextSelected.has(node.id)) return;
            if (node.type === CanvasNodeType.Group) {
                currentNodes.forEach((child) => {
                    if (child.metadata?.groupId === node.id) dragIds.add(child.id);
                });
            }
        });
        const initialSelectedNodes = new Map(currentNodes.filter((node) => dragIds.has(node.id)).map((node): [string, { x: number; y: number }] => [node.id, { x: node.position.x, y: node.position.y }]));
        dragRef.current = {
            isDraggingNode: true,
            pointerId: event.pointerId,
            hasMoved: false,
            startX: event.clientX,
            startY: event.clientY,
            initialSelectedNodes,
            movedIds: new Set(initialSelectedNodes.keys()),
        };
        previewRef.current = session.beginPreview();
        nodeDraggingRef.current = true;
        setIsNodeDragging(true);
    }, [selectNodeByEvent, session, setSelectedConnectionId]);

    const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (!dragRef.current.isDraggingNode) return;

        const moved = dragRef.current.hasMoved || (clientX != null && clientY != null && hasDragged(dragRef.current.startX, dragRef.current.startY, clientX, clientY));
        const wasClick = !moved && dragRef.current.initialSelectedNodes.size === 1;
        const clickedNodeId = dragRef.current.initialSelectedNodes.keys().next().value;
        const currentViewport = viewportRef.current;
        const dx = clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k;
        const dy = clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k;
        const initialPositions = dragRef.current.initialSelectedNodes;
        const movedIds = dragRef.current.movedIds;

        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
        setDropTargetGroupId(null);
        if (moved && clientX != null && clientY != null) {
            try {
                previewRef.current!.update((document) => {
                    const moved = document.nodes.map((node) => {
                        const initial = initialPositions.get(node.id);
                        return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
                    });
                    const targetGroup = findGroupDropTarget(movedIds, moved);
                    if (targetGroup) return { ...document, nodes: snapNodesIntoGroup(movedIds, moved, targetGroup) };
                    return { ...document, nodes: moved.map((node) => {
                        if (!movedIds.has(node.id) || node.type === CanvasNodeType.Group) return node;
                        const groupId = findContainingGroupId(node, moved);
                        if (node.metadata?.groupId === groupId) return node;
                        return { ...node, metadata: { ...node.metadata, groupId } };
                    }) };
                });
                previewRef.current!.commit({ kind: "ui" });
            } catch (error) { if (!session.signal.aborted) console.error("[canvas] drag cancelled", error); }
        } else {
            try { previewRef.current?.cancel(); }
            catch (error) { if (!session.signal.aborted) console.error("[canvas] drag cancelled", error); }
        }
        previewRef.current = null;

        dragRef.current.isDraggingNode = false;
        dragRef.current.pointerId = null;
        dragRef.current.hasMoved = false;
        dragRef.current.initialSelectedNodes = new Map();
        dragRef.current.movedIds = new Set();
        if (clientX != null && clientY != null && wasClick && clickedNodeId) {
            const clickedNode = nodesRef.current.find((node) => node.id === clickedNodeId);
            const clickedDefinition = clickedNode ? getNodeDefinition(clickedNode.type) : undefined;
            if (clickedDefinition?.hidePanel || clickedDefinition?.panelPresentation === "fullscreen") {
                // Clicking a display-only plugin node selects it without opening a lower panel.
                setDialogNodeId((current) => (current === clickedNodeId ? current : null));
            } else if (clickedNode?.type !== CanvasNodeType.Group) {
                setDialogNodeId(clickedNodeId);
                if (useConfigStore.getState().config.autoFocusOnSelect) {
                    // Wait for the generation panel to render so centering accounts for it.
                    requestAnimationFrame(() => focusNode(clickedNodeId));
                }
            }
        }
    }, [focusNode]);

    const moveNodeDrag = useCallback((event: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag.isDraggingNode || (!drag.hasMoved && !hasDragged(drag.startX, drag.startY, event.clientX, event.clientY))) return;
        drag.hasMoved = true;
        const scale = viewportRef.current.k;
        const dx = (event.clientX - drag.startX) / scale;
        const dy = (event.clientY - drag.startY) / scale;
        const moveNode = (node: CanvasNodeData) => {
            const initial = drag.initialSelectedNodes.get(node.id);
            return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
        };
        // 预览和分组命中共享位移，每帧最多更新一次。
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            try {
                const nodes = nodesRef.current.map(moveNode);
                previewRef.current!.update((document) => ({ ...document, nodes }));
                setDropTargetGroupId(findGroupDropTarget(drag.movedIds, nodes)?.id || null);
            } catch (error) { console.error("[canvas] drag cancelled", error); }
        });
    }, []);

    const startConnectionDrag = useCallback((gesture: ConnectionGesture) => {
        gesture.dragging = true;
        setPendingConnectionCreate(null);
        setPortSelectionActive(false);
        setMouseWorld(screenToCanvas(gesture.start.x, gesture.start.y));
        setConnecting(gesture.handle);
        connectionTargetNodeIdRef.current = null;
        setConnectionTargetNodeId(null);
        setSelectedConnectionId(null);
    }, [screenToCanvas, setConnecting, setSelectedConnectionId]);

    const selectPort = useCallback((nodeId: string, handleType: "source" | "target") => {
        if (selectionPointer.current || connectionGesture.current || nodeDraggingRef.current) return;
        const current = connectingParamsRef.current;
        if (handleType === "target") {
            if (!current || current.handleType !== "source" || !normalizeConnection(current.nodeId, nodeId, nodesRef.current, current.handleType)) return;
            connectNodes(current, nodeId);
            setConnecting(null);
            return;
        }
        if (current?.nodeId === nodeId && !pendingConnectionCreateRef.current) {
            setConnecting(null);
            return;
        }
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (!node) return;
        setPendingConnectionCreate(null);
        setMouseWorld({ x: node.position.x + node.width, y: node.position.y + node.height / 2 });
        setConnecting({ nodeId, handleType });
        setPortSelectionActive(true);
        setSelectedConnectionId(null);
    }, [connectNodes, setConnecting, setSelectedConnectionId]);

    const handleGlobalPointerMove = useCallback(
        (event: PointerEvent) => {
            if (dragRef.current.pointerId === event.pointerId) {
                moveNodeDrag(event);
                return;
            }
            const gesture = connectionGesture.current;
            if (gesture?.id === event.pointerId) {
                if (!gesture.dragging) {
                    if (!hasDragged(gesture.start.x, gesture.start.y, event.clientX, event.clientY)) return;
                    startConnectionDrag(gesture);
                }
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, gesture.handle);
                connectionTargetNodeIdRef.current = dropTarget.nodeId;
                setConnectionTargetNodeId(dropTarget.nodeId);
                setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            }

            const currentSelection = selectionBoxRef.current;
            if (!currentSelection || selectionPointer.current?.id !== event.pointerId) return;

            const world = screenToCanvas(event.clientX, event.clientY);
            const rectX = Math.min(currentSelection.startWorldX, world.x);
            const rectY = Math.min(currentSelection.startWorldY, world.y);
            const rectW = Math.abs(world.x - currentSelection.startWorldX);
            const rectH = Math.abs(world.y - currentSelection.startWorldY);
            const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

            nodesRef.current
                .forEach((node) => {
                    const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;

                    if (intersects) nextSelected.add(node.id);
                });

            const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            setSelectedNodeIds(nextSelected);
        },
        [getConnectionDropTarget, moveNodeDrag, screenToCanvas, startConnectionDrag],
    );

    const handleGlobalPointerUp = useCallback(
        (event: PointerEvent) => {
            if (dragRef.current.pointerId === event.pointerId) finishNodeDrag(event.clientX, event.clientY);
            if (selectionPointer.current?.id === event.pointerId && event.pointerType !== "mouse") handleGlobalPointerMove(event);
            finishSelection(event.pointerId, false);
            const gesture = connectionGesture.current;
            if (gesture?.id !== event.pointerId) return;
            connectionGesture.current = null;

            if (!gesture.dragging && !hasDragged(gesture.start.x, gesture.start.y, event.clientX, event.clientY)) {
                selectPort(gesture.handle.nodeId, gesture.handle.handleType);
                return;
            }
            const target = document.elementFromPoint(event.clientX, event.clientY);
            if (!target || !containerRef.current?.contains(target) || target.closest("[data-node-panel],[role='dialog'],[role='menu']")) {
                setConnecting(null);
                return;
            }
            const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, gesture.handle);
            if (dropTarget.nodeId) {
                connectNodes(gesture.handle, dropTarget.nodeId);
                setConnecting(null);
            } else if (dropTarget.isNearNode) {
                setConnecting(null);
            } else {
                const position = screenToCanvas(event.clientX, event.clientY);
                if (!gesture.dragging) startConnectionDrag(gesture);
                setMouseWorld(position);
                setPendingConnectionCreate({ connection: gesture.handle, position });
            }
        },
        [connectNodes, finishNodeDrag, finishSelection, getConnectionDropTarget, handleGlobalPointerMove, screenToCanvas, selectPort, setConnecting, startConnectionDrag],
    );

    useEffect(() => {
        const cancelInteraction = (event: Event) => {
            const id = event instanceof PointerEvent ? event.pointerId : undefined;
            if (id === undefined || dragRef.current.pointerId === id) finishNodeDrag();
            finishSelection(id, true);
            if (id === undefined || id === connectionGesture.current?.id) setConnecting(null);
        };
        window.addEventListener("pointerup", handleGlobalPointerUp);
        window.addEventListener("pointercancel", cancelInteraction);
        window.addEventListener("lostpointercapture", cancelInteraction);
        window.addEventListener("blur", cancelInteraction);
        window.addEventListener("pointermove", handleGlobalPointerMove);
        return () => {
            window.removeEventListener("pointerup", handleGlobalPointerUp);
            window.removeEventListener("pointercancel", cancelInteraction);
            window.removeEventListener("lostpointercapture", cancelInteraction);
            window.removeEventListener("blur", cancelInteraction);
            window.removeEventListener("pointermove", handleGlobalPointerMove);
        };
    }, [finishNodeDrag, finishSelection, handleGlobalPointerMove, handleGlobalPointerUp, setConnecting]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-no-zoom],[data-canvas-shortcuts-ignore],[role='dialog'][aria-modal='true']")) return;

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;

            if (isModifierShortcut && key === "c" && window.getSelection()?.toString()) return;

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setContextMenu(null);
                setSelectionBox(null);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "g") {
                if (event.shiftKey) {
                    if (canUngroupSelectedNodes(selectedNodeIdsRef.current, nodesRef.current)) {
                        event.preventDefault();
                        void executeCommand(canvasUngroupNodes, { nodeIds: [...selectedNodeIdsRef.current] }, commandOptions).catch((error) => { if (!session.signal.aborted) void toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error); });
                    }
                    return;
                }
                if (canGroupSelectedNodes(selectedNodeIdsRef.current, nodesRef.current)) {
                    event.preventDefault();
                    void executeCommand(canvasGroupNodes, { nodeIds: [...selectedNodeIdsRef.current] }, commandOptions).catch((error) => { if (!session.signal.aborted) void toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error); });
                }
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "c") {
                event.preventDefault();
                void copySelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "v") {
                event.preventDefault();
                void pasteClipboard();
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNodeIdsRef.current.size) {
                    void executeCommand(canvasDeleteNodes, { nodeIds: [...selectedNodeIdsRef.current] }, commandOptions).catch((error) => { if (!session.signal.aborted) void toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error); });
                } else if (selectedConnectionId) {
                    void executeCommand(canvasApply, { ops: [{ type: "delete_connections", ids: [selectedConnectionId] }] }, commandOptions).catch((error) => { if (!session.signal.aborted) void toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error); });
                }
            }

            if (event.key === "Escape") {
                finishSelection(undefined, false);
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setContextMenu(null);
                setNodeCreatePosition(null);
                setSelectionBox(null);
                setConnecting(null);
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                nodeInfo?.close();
                setPendingConnectionCreate(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [commandOptions, copySelectedNodes, finishSelection, nodeInfo, pasteClipboard, redoCanvas, selectedConnectionId, session, setConnecting, undoCanvas]);

    const handleConnectStart = useCallback(
        (event: ReactPointerEvent, nodeId: string, handleType: "source" | "target") => {
            event.stopPropagation();
            if (!event.isPrimary || event.button !== 0 || selectionPointer.current || previewRef.current || connectionGesture.current) return;
            const touch = event.pointerType === "touch";
            if (touch && isCanvasTouchEdge(event.clientX)) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const gesture: ConnectionGesture = {
                id: event.pointerId,
                handle: { nodeId, handleType },
                start: { x: event.clientX, y: event.clientY },
                dragging: false,
            };
            connectionGesture.current = gesture;
            if (!touch) startConnectionDrag(gesture);
        },
        [startConnectionDrag],
    );

    const handlePortTap = useCallback((event: ReactMouseEvent, nodeId: string, handleType: "source" | "target") => {
        event.stopPropagation();
        selectPort(nodeId, handleType);
    }, [selectPort]);

    const handleExtendNode = useCallback((event: ReactMouseEvent, node: CanvasNodeData) => {
        event.stopPropagation();
        const anchor = event.currentTarget.getBoundingClientRect();
        setContextMenu(null);
        setNodeCreatePosition(null);
        setPendingConnectionCreate({
            connection: { nodeId: node.id, handleType: "source" },
            position: { x: node.position.x + node.width + 40, y: node.position.y },
            menuPosition: screenToCanvas(anchor.right, anchor.top),
        });
    }, [screenToCanvas]);

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        try { previewRef.current!.update((document) => ({ ...document, nodes: document.nodes.map((node) => (node.id === nodeId ? { ...node, width, height, position: position || node.position } : node)) })); }
        catch (error) { console.error("[canvas] resize cancelled", error); }
    }, []);

    const handleNodeResizeStart = useCallback(() => {
        previewRef.current = session.beginPreview();
        setIsNodeResizing(true);
    }, []);
    const handleNodeResizeEnd = useCallback(() => {
        try { previewRef.current!.commit({ kind: "ui" }); }
        catch (error) { if (!session.signal.aborted) console.error("[canvas] resize cancelled", error); }
        previewRef.current = null;
        setIsNodeResizing(false);
    }, []);

    const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, title } : node)));
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt } } : node)));
    }, []);

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const files = Array.from(event.dataTransfer.files).filter(
                (item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item),
            );
            if (!files.length) return;

            const position = screenToCanvas(event.clientX, event.clientY);
            const before = session.getSnapshot().nodes;
            void executeCommand(canvasImportMedia, { files, position }, commandOptions).then((snapshot) => {
                if (!commandOptions.scope.signal.aborted) registerChangedCanvasAssets(before, snapshot.nodes);
            }).catch((error) => {
                if (!commandOptions.scope.signal.aborted) toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error);
            });
        },
        [commandOptions, screenToCanvas],
    );

    const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest("[data-node-id]")) return;
        event.preventDefault();
        setContextMenu(null);
    }, []);

    const handleAssetInsert = useCallback(async (asset: CanvasAssetInput, signal: AbortSignal) => {
        await executeCommand(canvasInsertAsset, { asset, position: getCanvasCenter!() }, { ...commandOptions, signal });
    }, [commandOptions, getCanvasCenter]);

    // Memoize every callback and render function passed to CanvasNode.
    // CanvasNode uses React.memo, but new prop references would invalidate it on every render and rerender every node
    // during click, hover, or viewport changes, which is especially expensive for Markdown. These useCallback values
    // and their memoized map/handler dependencies remain stable during interaction, so unchanged nodes do not rerender.
    const handleNodeHoverStart = useCallback((nodeId: string) => {
        if (nodeDraggingRef.current) return;
        setHoveredNodeId(nodeId);
    }, []);
    const handleNodeHoverEnd = useCallback((nodeId: string) => {
        setHoveredNodeId((current) => (current === nodeId ? null : current));
    }, []);
    const handleNodeContextMenu = useCallback((event: ReactMouseEvent, nodeId: string) => {
        event.preventDefault();
        event.stopPropagation();
        if (dragRef.current.pointerId !== null || connectionGesture.current) return;
        setSelectedNodeIds((current) => (current.has(nodeId) ? current : new Set([nodeId])));
        setSelectedConnectionId(null);
        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId });
    }, []);

    return (
        <main className="relative isolate flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            {view ? <CanvasSidePanel view={view} /> : null}
            <section className="relative min-w-0 flex-1 overflow-hidden">
                {view ? <CanvasChrome session={session} view={view} /> : null}

                <InfiniteCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    tool={canvasTool}
                    backgroundMode={currentProject!.backgroundMode}
                    onViewportChange={(next) => {
                        setViewport(next);
                        setContextMenu(null);
                    }}
                    onSelectionStart={referencePickerNodeId ? undefined : handleCanvasSelectionStart}
                    onSelectionCancel={(pointerId) => finishSelection(pointerId, true)}
                    onCanvasDeselect={referencePickerNodeId ? undefined : deselectCanvas}
                    onCanvasDoubleClick={(event) => {
                        if (referencePickerNodeId) return;
                        setContextMenu(null);
                        setNodeCreatePosition(screenToCanvas(event.clientX, event.clientY));
                    }}
                    onContextMenu={preventCanvasContextMenu}
                    onDrop={handleDrop}
                >
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
                        {visibleConnections.map(({ connection, from, to }) => (
                            <ConnectionPath
                                key={connection.id}
                                connection={connection}
                                from={from}
                                to={to}
                                active={selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id)}
                                onSelect={() => {
                                    setSelectedConnectionId(connection.id);
                                    setSelectedNodeIds(new Set());
                                    setContextMenu(null);
                                }}
                                onContextMenu={(event) => {
                                    setSelectedConnectionId(connection.id);
                                    setSelectedNodeIds(new Set());
                                    setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId: connection.id });
                                }}
                            />
                        ))}
                        {connectingParams ? <ActiveConnectionPath node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} target={connectionTargetNodeId ? nodeById.get(connectionTargetNodeId) : undefined} /> : null}
                    </svg>

                    {visibleNodes.map((node) => (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            scale={viewport.k}
                            isSelected={selectedNodeIds.has(node.id)}
                            isRelated={relatedHighlight.nodeIds.has(node.id)}
                            isFocusRelated={activeNodeId === node.id}
                            isConnectionTarget={connectionTargetNodeId === node.id}
                            isConnecting={Boolean(connectingParams)}
                            portSelectionActive={portSelectionActive}
                            canCompletePort={Boolean(connectedPortTargets && node.id !== connectingParams?.nodeId && !connectedPortTargets.has(node.id))}
                            onExtend={node.id === singleSelectedNodeId ? handleExtendNode : undefined}
                            referenceSelectionState={!referenceConnectedNodeIds ? undefined : node.id === referencePickerNodeId ? "target" : referenceConnectedNodeIds.has(node.id) || !isCanvasReferenceNode(node, nodes) ? "disabled" : "available"}
                            showPanel={!dockedPanel && !compactPanel && inlinePanel?.id === node.id}
                            isGroupDropTarget={dropTargetGroupId === node.id}
                            pluginHost={pluginHost}
                            registryVersion={nodeRegistryVersion}
                            renderPanel={dialogNodeId === node.id ? renderPluginPanel : undefined}
                            onDragStart={handleNodeDragStart}
                            onSelectCapture={handleNodeSelectCapture}
                            onHoverStart={handleNodeHoverStart}
                            onHoverEnd={handleNodeHoverEnd}
                            onConnectStart={handleConnectStart}
                            onPortTap={handlePortTap}
                            onResizeStart={handleNodeResizeStart}
                            onResize={handleNodeResize}
                            onResizeEnd={handleNodeResizeEnd}
                            onTitleChange={handleNodeTitleChange}
                            onSelectReference={referenceConnectedNodeIds ? selectNodeReference : undefined}
                            onContextMenu={handleNodeContextMenu}
                        />
                    ))}

                    {selectionBox ? (
                        <svg
                            className="pointer-events-none absolute z-[100] overflow-visible"
                            style={{
                                left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
                                top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
                                width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
                                height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
                            }}
                        >
                            <rect width="100%" height="100%" fill={theme.canvas.selectionFill} stroke={theme.canvas.selectionStroke} strokeOpacity={0.55} strokeWidth={1 / viewport.k} strokeDasharray={`${6 / viewport.k} ${4 / viewport.k}`} />
                        </svg>
                    ) : null}
                    {pendingConnectionCreate ? <ConnectionCreateMenu pending={pendingConnectionCreate} scale={viewport.k} onClose={cancelPendingConnectionCreate} /> : null}
                    {nodeCreatePosition ? (
                        <NodeCreateMenu
                            position={nodeCreatePosition}
                            scale={viewport.k}
                            onClose={() => setNodeCreatePosition(null)}
                        />
                    ) : null}
                </InfiniteCanvas>

                {referencePickerNodeId ? <button type="button" className="absolute left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} onClick={exitNodeReferenceSelection}>从画布选择参考 · ESC 返回输入框</button> : null}

                <CanvasHoverPreview node={hoverNodeId ? nodeById.get(hoverNodeId) ?? null : null} size={size} />

                <CanvasNodeHoverToolbar
                    node={isNodeDragging || isNodeResizing || nodeImageSettingsOpen || Boolean(referencePickerNodeId) || expandedBatchNodeIds.has(toolbarNode?.id || "") ? null : toolbarNode}
                    viewport={viewport}
                    extraTools={toolbarNode ? buildNodeToolbarItems(toolbarNode) : undefined}
                    onKeep={keepNodeToolbar}
                    onLeave={hideNodeToolbar}
                />

                {hasMultipleSelectedNodes && !selectionBox ? (
                    <CanvasSelectionToolbar
                        nodes={selectedNodes}
                        viewport={viewport}
                        showToolbar={!isNodeDragging && !isNodeResizing}
                    />
                ) : null}

                {fullscreenNode && renderPluginPanel(fullscreenNode)}
                {compactPanel ? <CompactInputPanel key={compactPanel.id} node={compactPanel} renderPanel={renderPluginPanel} /> : null}
                {dockedPanel ? (
                    <div className="thin-scrollbar absolute inset-x-3 bottom-32 z-[71] mx-auto max-h-[45dvh] max-w-[600px] overflow-y-auto overscroll-contain" data-canvas-no-zoom data-canvas-docked-panel={dockedPanel.id}>
                        {renderPluginPanel(dockedPanel)}
                    </div>
                ) : null}
                <PluginPanels />
                {view ? <CanvasToolbar session={session} view={view} /> : null}

                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

                {contextMenu ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        onClose={() => setContextMenu(null)}
                    />
                ) : null}

                {nodeInfo ? <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={nodeInfo.close} /> : null}

                {imageEditors}

                <CanvasDialog title="图片详情" open={Boolean(imagePreview)} onClose={() => imagePreview?.close()}>
                    <div className="flex max-h-[80vh] items-center justify-center">
                        {imagePreview?.url ? <img src={imagePreview.url} alt={imagePreview.title} className="max-h-[80vh] max-w-full object-contain" /> : imagePreview && <span className="p-6">正在读取图片…</span>}
                    </div>
                </CanvasDialog>

                {stopConfirmation && <CanvasDialog key={stopConfirmation.id} title="停止生成？" description="当前生成请求会被中断，已经生成完成的内容会保留。" open onClose={stopConfirmation.cancel}>
                    <footer className="mt-3 flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" data-cancel disabled={stopConfirmation.pending} onClick={stopConfirmation.cancel}>继续生成</Button>
                        <Button type="button" variant="destructive" size="sm" aria-busy={stopConfirmation.pending} disabled={stopConfirmation.pending} onClick={() => void stopConfirmation.accept()}>
                            {stopConfirmation.pending && <LoaderCircle className="size-4 animate-spin" />}停止
                        </Button>
                    </footer>
                </CanvasDialog>}

                <CanvasDialog title="清空画布？" description="这会删除当前画布上的所有节点和连线。" open={Boolean(clearConfirmation)} onClose={() => clearConfirmation?.close()}>
                    <footer className="mt-3 flex justify-end gap-2">
                        <Dialog.Close asChild><Button type="button" variant="outline" size="sm" data-cancel>取消</Button></Dialog.Close>
                        <Button type="button" variant="destructive" size="sm" disabled={clearConfirmation?.pending} aria-busy={clearConfirmation?.pending} onClick={() => {
                            if (!clearConfirmation) return;
                            void clearConfirmation.confirm().catch(error => {
                                if (!clearConfirmation.scope.signal.aborted) toast.error(getPluginErrorMessage(error), workbenchMessageOptions.error);
                            });
                        }}>{clearConfirmation?.pending && <LoaderCircle className="size-4 animate-spin" />}清空</Button>
                    </footer>
                </CanvasDialog>

                <AssetPickerModal parentSignal={commandOptions.scope.signal} open={assetPickerOpen} onInsert={handleAssetInsert} onClose={() => setAssetPickerOpen(false)} />
            </section>
        </main>
    );
}

function CompactInputPanel({ node, renderPanel }: { node: CanvasNodeData; renderPanel: (node: CanvasNodeData) => React.ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [expanded, setExpanded] = useState(false);
    const Icon = expanded ? ChevronDown : ChevronUp;
    return (
        <div className="pointer-events-none absolute inset-x-3 bottom-32 z-[71] mx-auto flex max-w-[600px] flex-col items-center gap-2">
            {expanded ? (
                <div className="thin-scrollbar pointer-events-auto max-h-[45dvh] w-full overflow-y-auto overscroll-contain" data-canvas-no-zoom data-canvas-docked-panel={node.id}>
                    {renderPanel(node)}
                </div>
            ) : null}
            <button type="button" aria-expanded={expanded} className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm" style={{ color: theme.node.text, background: theme.toolbar.panel, borderColor: theme.toolbar.border }} onClick={() => setExpanded(!expanded)}>
                <Icon className="size-4" aria-hidden="true" />
                {expanded ? "收起输入面板" : "展开输入面板"}
            </button>
        </div>
    );
}
