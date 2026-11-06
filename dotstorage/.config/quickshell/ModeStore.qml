pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// The dictation modes in ~/.config/hex-dictate/modes.json, the file hex-dictate reads.
Singleton {
    id: root

    readonly property string path: (Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config") + "/hex-dictate/modes.json"
    property var modes: []
    property string error: ""
    // Changed outside this store, so an open editor has to reload its fields.
    signal changedOnDisk()

    readonly property bool valid: modes.every(mode => mode.name.trim() !== "" && mode.prompt.trim() !== "")
    property string written: ""

    function reload(): void {
        file.reload();
    }

    // Keep edits in memory while typing; they reach the file once every mode is complete.
    function update(next): void {
        modes = next;
        saveTimer.restart();
    }

    function flush(): void {
        saveTimer.stop();
        if (!valid) return;
        const json = JSON.stringify({ version: 1, modes: modes }, null, 2) + "\n";
        if (json === written) return;
        written = json;
        file.setText(json);
    }

    function slug(name, index): string {
        const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mode";
        const taken = id => id === "raw" || modes.some((mode, i) => i !== index && mode.id === id);
        let id = base;
        for (let n = 2; taken(id); n++) id = base + "-" + n;
        return id;
    }

    Timer {
        id: saveTimer
        interval: 300
        onTriggered: root.flush()
    }

    FileView {
        id: file
        path: root.path
        watchChanges: true
        onFileChanged: reload()
        onLoaded: {
            const content = text();
            if (content === root.written) return;
            try {
                root.modes = JSON.parse(content).modes;
                root.error = "";
                root.written = content;
                root.changedOnDisk();
            } catch (e) {
                root.error = "modes.json has a problem: " + e.message;
            }
        }
        onLoadFailed: root.error = "Couldn't read " + root.path
    }
}
