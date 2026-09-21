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

    // window id -> {width, floating, workspaceId}
    property var windows: ({})
    // workspace id -> output name, so a window can be matched to its own screen.
    property var workspaceOutputs: ({})
    property int focusedId: -1

    function outputWidthFor(workspaceId) {
        const screen = Quickshell.screens.find(s => s.name === workspaceOutputs[workspaceId]);
        return screen ? screen.width : 0;
    }

    function recompute() {
        const focused = windows[focusedId];
        focusedMaximized = focused !== undefined && !focused.floating && focused.width >= outputWidthFor(focused.workspaceId);
    }

    function remember(window) {
        windows[window.id] = {
            width: window.layout ? window.layout.tile_size[0] : 0,
            floating: window.is_floating,
            workspaceId: window.workspace_id
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
                    root.remember(event.WindowOpenedOrChanged.window);
                    if (event.WindowOpenedOrChanged.window.is_focused) root.focusedId = event.WindowOpenedOrChanged.window.id;
                } else if (event.WindowClosed) {
                    delete root.windows[event.WindowClosed.id];
                } else if (event.WorkspacesChanged) {
                    const outputs = {};
                    for (const workspace of event.WorkspacesChanged.workspaces) outputs[workspace.id] = workspace.output;
                    root.workspaceOutputs = outputs;
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
                root.recompute();
            }
        }
    }
}
