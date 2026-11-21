pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// The captain's bridge-ipad dashboard (poormans-captain/bridge-ipad, served from
// this laptop): its view (near | far) and theme (dark | light), read and set
// through the server's localhost-only /state endpoint. Polled every 3s while the
// popup is open (the iPad's own taps show up too), every 30s otherwise.
Singleton {
    id: root

    readonly property string endpoint: "http://127.0.0.1:42461/state"

    // False while the bridge server is down; the popup says so instead of erroring.
    property bool reachable: false
    property bool loading: false
    // "near" | "far", "" until the first read.
    property string view: ""
    // "dark" | "light", "" until the first read.
    property string theme: ""
    // Who changed it last: "laptop", "ipad" or "default".
    property string changedBy: ""
    property bool polling: false

    function refresh() {
        if (!readProcess.running) readProcess.running = true;
    }

    function setView(value) {
        set("view", value);
    }

    function setTheme(value) {
        set("theme", value);
    }

    // Optimistic: the switch flips right away, the response (or the next poll) settles it.
    function set(key, value) {
        root[key] = value;
        Quickshell.execDetached(["curl", "-s", "-m", "2", "-X", "POST", `${root.endpoint}?${key}=${value}`]);
        refreshSoon.restart();
    }

    function apply(text) {
        try {
            const state = JSON.parse(text);
            root.view = state.view ?? "";
            root.theme = state.theme ?? "";
            root.changedBy = state.by ?? "";
            root.reachable = root.view.length > 0 && root.theme.length > 0;
        } catch (e) {
            root.reachable = false;
        }
    }

    Process {
        id: readProcess
        command: ["curl", "-sf", "-m", "2", root.endpoint]
        onRunningChanged: if (running) root.loading = true
        stdout: StdioCollector {
            onStreamFinished: root.apply(text)
        }
        onExited: code => {
            root.loading = false;
            if (code !== 0) root.reachable = false;
        }
    }

    Timer {
        interval: root.polling ? 3000 : 30000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.refresh()
    }

    Timer {
        id: refreshSoon
        interval: 400
        onTriggered: root.refresh()
    }
}
