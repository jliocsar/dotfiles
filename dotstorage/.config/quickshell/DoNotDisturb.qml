pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// Do Not Disturb: while on, only critical notifications show up.
// State lives in quickshell's state dir so it survives restarts without dirtying the repo.
// `qs ipc call dnd toggle` for keybinds.
Singleton {
    id: root

    readonly property bool enabled: state.enabled

    function toggle(): void {
        state.enabled = !state.enabled;
    }

    FileView {
        path: Quickshell.statePath("dnd.json")
        watchChanges: true
        onFileChanged: reload()
        onAdapterUpdated: writeAdapter()
        // Missing file on first run is fine; it gets written on the first toggle.
        onLoadFailed: error => { if (error !== FileViewError.FileNotFound) console.warn("dnd.json:", FileViewError.toString(error)); }

        JsonAdapter {
            id: state
            property bool enabled: false
        }
    }

    IpcHandler {
        target: "dnd"
        function toggle(): void { root.toggle(); }
        function isEnabled(): bool { return root.enabled; }
    }
}
