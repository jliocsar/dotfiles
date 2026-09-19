pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// Tracks niri state from `niri msg event-stream` so the dock can hide behind
// a Mod+M maximized window. A window counts as maximized when its tile spans
// the full output width and it isn't floating.
Singleton {
    id: root

    property bool focusedMaximized: false

    // window id -> {tile_width, is_floating}
    property var windows: ({})
    property int focusedId: -1
    property real outputWidth: Quickshell.screens.length > 0 ? Quickshell.screens[0].width : 1920

    function recompute() {
        const focused = windows[focusedId];
        focusedMaximized = focused !== undefined && !focused.floating && focused.width >= outputWidth;
    }

    function remember(window) {
        windows[window.id] = {
            width: window.layout ? window.layout.tile_size[0] : 0,
            floating: window.is_floating
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
                } else if (event.WindowFocusChanged) {
                    root.focusedId = event.WindowFocusChanged.id ?? -1;
                } else if (event.WindowLayoutsChanged) {
                    for (const [id, layout] of event.WindowLayoutsChanged.changes) {
                        const known = root.windows[id];
                        if (known) known.width = layout.tile_size[0];
                    }
                } else {
                    return;
                }
                root.recompute();
            }
        }
    }
}
