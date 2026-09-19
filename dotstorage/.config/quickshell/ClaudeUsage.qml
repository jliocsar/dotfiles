pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// Claude Code subscription usage via the waybar-claude-usage script
// (it already parses `claude /usage`; output is {text, tooltip, class}).
Singleton {
    id: root

    property string text: "…"
    property string tooltip: ""
    property string level: ""

    Process {
        id: usageProcess
        command: ["waybar-claude-usage"]
        stdout: StdioCollector {
            onStreamFinished: {
                try {
                    const report = JSON.parse(text);
                    root.text = report.text;
                    // "Session: 2% used · resets …" reads better one fact per line.
                    root.tooltip = report.tooltip.replace(/ · /g, "\n");
                    root.level = report.class;
                } catch (e) {
                    root.text = "–";
                    root.tooltip = "claude usage unavailable";
                    root.level = "unavailable";
                }
            }
        }
    }

    Timer {
        interval: 300000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: if (!usageProcess.running) usageProcess.running = true
    }
}
