pragma Singleton
import QtQuick
import Quickshell

// Starts apps outside quickshell.service. A plain execute()/execDetached child stays in the
// bar's cgroup, and the unit's KillMode=control-group then kills every app the dock opened
// whenever the bar restarts (11-27: a restart took chrome, wyrm and the rest with it).
// systemd-run --scope puts each launch in its own app-qs-<name>-<n>.scope under app.slice,
// the same place a terminal or niri launch would land.
Singleton {
    id: root

    property int n: 0

    function unitName(name: string): string {
        root.n += 1;
        const safe = String(name || "app").replace(/\.desktop$/, "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 40);
        return `app-qs-${safe}-${Date.now()}${root.n}.scope`;
    }

    // a command list, outside the bar's cgroup
    function cmd(command: var, name: string, cwd: string): void {
        // the array form: this qs (0.3.1) refuses execDetached({command, ...}) with a TypeError
        Quickshell.execDetached(["systemd-run", "--user", "--scope", "--slice=app.slice", "--collect", "--quiet",
            `--unit=${unitName(name)}`, `--working-directory=${cwd || Quickshell.env("HOME")}`, "--"].concat(Array.from(command, String)));
    }

    // a DesktopEntry or one of its actions. a terminal app keeps execute(): it needs the terminal wrapper
    function app(entry: var): void {
        if (!entry) return;
        if (entry.runInTerminal || !entry.command || entry.command.length === 0) {
            entry.execute();
            return;
        }
        cmd(entry.command, entry.id ?? entry.name, entry.workingDirectory ?? "");
    }
}
