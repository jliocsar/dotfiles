pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// Tracks niri state from `niri msg event-stream` so the dock can hide behind
// a Mod+M maximized window. A window counts as maximized when its tile spans
// the full width of the output it lives on and it isn't floating. Mod+F
// (maximize-column) keeps gaps, so its tile stays narrower and doesn't count.
Singleton {
    id: root

    property bool focusedMaximized: false

    // Keyboard layouts as niri reports them ("English (US)", "Portuguese (Brazil)").
    property var layoutNames: []
    property int layoutIndex: 0
    readonly property string layoutName: layoutNames[layoutIndex] ?? ""
    readonly property string layoutLabel: layoutName.startsWith("Portuguese") ? "br"
        : layoutName.startsWith("English") ? "en"
        : layoutName.slice(0, 2).toLowerCase()

    // window id -> {width, floating, workspaceId, appId}
    property var windows: ({})
    // workspace id -> {idx, output, focused}, so a window can be matched to its own screen.
    property var workspaces: ({})
    property int focusedId: -1

    // Fires once per window when niri first reports it; windows already open at startup don't count.
    signal windowOpened(int id, var window)

    function outputWidthFor(workspaceId) {
        const screen = Quickshell.screens.find(s => s.name === workspaces[workspaceId]?.output);
        return screen ? screen.width : 0;
    }

    // niri has no minimize: park the window on the empty workspace niri keeps at the bottom
    // of the window's own monitor (workspace indexes resolve on the window's monitor).
    function stashWindow(id) {
        const output = workspaces[windows[id]?.workspaceId]?.output;
        if (output === undefined) return;
        const lastIdx = Math.max(...Object.values(workspaces).filter(workspace => workspace.output === output).map(workspace => workspace.idx));
        Quickshell.execDetached(["niri", "msg", "action", "move-window-to-workspace", "--window-id", String(id), "--focus", "false", String(lastIdx)]);
    }

    // Brings a window onto the focused workspace and focuses it. One shell keeps the steps
    // ordered: monitor first, because the workspace index resolves on the window's monitor.
    function summonWindow(id) {
        const focused = Object.values(workspaces).find(workspace => workspace.focused);
        if (focused === undefined || windows[id] === undefined) return;
        Quickshell.execDetached(["sh", "-c",
            'niri msg action move-window-to-monitor --id "$1" "$2" && niri msg action move-window-to-workspace --window-id "$1" --focus false "$3" && niri msg action focus-window --id "$1"',
            "_", String(id), focused.output, String(focused.idx)]);
    }

    function recompute() {
        const focused = windows[focusedId];
        focusedMaximized = focused !== undefined && !focused.floating && focused.width >= outputWidthFor(focused.workspaceId);
    }

    function remember(window) {
        windows[window.id] = {
            width: window.layout ? window.layout.tile_size[0] : 0,
            floating: window.is_floating,
            workspaceId: window.workspace_id,
            appId: window.app_id ?? ""
        };
    }

    Process {
        running: true
        command: ["niri", "msg", "--json", "event-stream"]
        stdout: SplitParser {
            onRead: line => {
                let event;
                try {
                    event = JSON.parse(line);
                } catch (e) {
                    return;
                }
                if (event.WindowsChanged) {
                    root.windows = {};
                    for (const window of event.WindowsChanged.windows) {
                        root.remember(window);
                        if (window.is_focused) root.focusedId = window.id;
                    }
                } else if (event.WindowOpenedOrChanged) {
                    const window = event.WindowOpenedOrChanged.window;
                    const isNew = root.windows[window.id] === undefined;
                    root.remember(window);
                    if (window.is_focused) root.focusedId = window.id;
                    if (isNew) root.windowOpened(window.id, root.windows[window.id]);
                } else if (event.WindowClosed) {
                    delete root.windows[event.WindowClosed.id];
                } else if (event.WorkspacesChanged) {
                    const workspaces = {};
                    for (const workspace of event.WorkspacesChanged.workspaces) {
                        workspaces[workspace.id] = { idx: workspace.idx, output: workspace.output, focused: workspace.is_focused };
                    }
                    root.workspaces = workspaces;
                } else if (event.WorkspaceActivated) {
                    if (!event.WorkspaceActivated.focused) return;
                    for (const [id, workspace] of Object.entries(root.workspaces)) workspace.focused = Number(id) === event.WorkspaceActivated.id;
                } else if (event.WindowFocusChanged) {
                    root.focusedId = event.WindowFocusChanged.id ?? -1;
                } else if (event.WindowLayoutsChanged) {
                    for (const [id, layout] of event.WindowLayoutsChanged.changes) {
                        const known = root.windows[id];
                        if (known) known.width = layout.tile_size[0];
                    }
                } else if (event.KeyboardLayoutsChanged) {
                    root.layoutNames = event.KeyboardLayoutsChanged.keyboard_layouts.names;
                    root.layoutIndex = event.KeyboardLayoutsChanged.keyboard_layouts.current_idx;
                    return;
                } else if (event.KeyboardLayoutSwitched) {
                    root.layoutIndex = event.KeyboardLayoutSwitched.idx;
                    return;
                } else {
                    return;
                }
                // windows/workspaces are mutated in place, so nudge bindings that read them.
                root.windowsChanged();
                root.recompute();
            }
        }
    }
}
