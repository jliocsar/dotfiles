pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// Claude Code subscription usage, parsed straight from `claude /usage`.
Singleton {
    id: root

    // [{label, percent, resets}] — the session window comes first.
    property var windows: []
    // "969 requests · 37 sessions" over the last 24h.
    property string activity: ""
    property date updatedAt: new Date(0)
    property bool loading: false

    readonly property bool available: windows.length > 0
    readonly property int sessionPercent: available ? windows[0].percent : 0
    readonly property string text: available ? sessionPercent + "%" : "–"
    readonly property string level: !available ? "unavailable"
        : sessionPercent >= 90 ? "critical"
        : sessionPercent >= 70 ? "warning" : ""

    function levelColor(percent) {
        return percent >= 90 ? Theme.red : percent >= 70 ? Theme.yellow : Theme.accent;
    }

    function refresh() {
        if (!usageProcess.running) usageProcess.running = true;
    }

    Process {
        id: usageProcess
        command: ["timeout", "60", "claude", "-p", "--output-format", "json", "--no-session-persistence", "/usage"]
        onRunningChanged: root.loading = running
        stdout: StdioCollector {
            onStreamFinished: {
                let report = "";
                try {
                    report = JSON.parse(text).result ?? "";
                } catch (e) {
                    report = "";
                }
                const windows = [];
                for (const line of report.split("\n")) {
                    // "Current session: 2% used · resets Sep 19, 12am (America/Belem)"
                    const match = line.match(/^Current (.+?): (\d+)% used · resets (.+?)(?: \([\w\/]+\))?$/);
                    if (match) windows.push({ label: match[1], percent: Number(match[2]), resets: match[3] });
                }
                root.windows = windows;
                root.activity = report.match(/^Last 24h · (.+)$/m)?.[1] ?? "";
                root.updatedAt = new Date();
            }
        }
    }

    Timer {
        interval: 300000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.refresh()
    }
}
