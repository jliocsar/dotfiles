pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// Do Not Disturb, backed by hokum (the notification daemon). hokum owns the state
// (saved in its config.kdl); we just mirror it via `hokum dnd --watch --json`.
// `qs ipc call dnd toggle` or `hokum dnd toggle` for keybinds.
Singleton {
    id: root

    property bool enabled: false

    function toggle(): void {
        Quickshell.execDetached(["hokum", "dnd", "toggle"]);
    }

    Process {
        id: watcher
        running: true
        command: ["hokum", "dnd", "--watch", "--json"]
        stdout: SplitParser {
            onRead: line => {
                try { root.enabled = JSON.parse(line).dnd === true; }
                catch (e) { console.warn("hokum dnd:", line); }
            }
        }
        // hokum missing or restarting: retry instead of going stale.
        onExited: retry.start()
    }

    Timer {
        id: retry
        interval: 5000
        onTriggered: watcher.running = true
    }

    IpcHandler {
        target: "dnd"
        function toggle(): void { root.toggle(); }
        function isEnabled(): bool { return root.enabled; }
    }
}
