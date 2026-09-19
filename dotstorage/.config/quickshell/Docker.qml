pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// Running containers, refreshed every 10s (and on demand after an action).
Singleton {
    id: root

    property bool reachable: true
    // [{name, image, status}]
    property var containers: []

    function refresh() {
        if (!listProcess.running) listProcess.running = true;
    }

    function act(verb, name) {
        Quickshell.execDetached(["sh", "-c", `docker ${verb} "$1" >/dev/null && notify-send docker "${verb}: $1"`, "_", name]);
        refreshSoon.restart();
    }

    function openLogs(name) {
        Quickshell.execDetached(["ghostty", "-e", "docker", "logs", "-f", "--tail", "200", name]);
    }

    function openShell(name) {
        Quickshell.execDetached(["ghostty", "-e", "docker", "exec", "-it", name, "sh", "-c", "command -v bash >/dev/null && exec bash || exec sh"]);
    }

    Process {
        id: listProcess
        command: ["docker", "ps", "--format", "{{.Names}}\t{{.Image}}\t{{.Status}}"]
        stdout: StdioCollector {
            onStreamFinished: {
                root.containers = text.split("\n").filter(line => line.length > 0).map(line => {
                    const [name, image, status] = line.split("\t");
                    return { name, image, status };
                });
            }
        }
        onExited: code => root.reachable = code === 0
    }

    Timer {
        interval: 10000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.refresh()
    }

    Timer {
        id: refreshSoon
        interval: 1500
        onTriggered: root.refresh()
    }
}
