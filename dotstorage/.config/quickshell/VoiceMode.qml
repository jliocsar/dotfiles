pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// The captain's voice mode (Mod+Shift+Space, ~/Projects/poormans-captain/voice). voiced.py and voice.sh
// write off | starting | listening | loading | speaking to tmp/voice/state; a missing file is off.
// The bar shows it as a dot on the bridge wheel (JC picked the plain red dot, 11-25).
Singleton {
    id: root

    property string mode: "off"
    // the hey-flint standby, asleep: not live, but the keyword works (JC 11-27: "so I know that I can trigger via
    // the keyword"). voiced writes asleep while the standby waits for "hey flint"
    readonly property bool asleep: mode === "asleep"
    readonly property bool on: mode !== "" && mode !== "off" && mode !== "asleep"
    // Starting up, or transcribing + waiting on the captain's answer.
    readonly property bool busy: mode === "starting" || mode === "loading"
    readonly property bool speaking: mode === "speaking"

    readonly property string script: Quickshell.env("HOME") + "/Projects/poormans-captain/voice/voice.sh"

    // Turn it on or off (the bridge popup's Voice switch, a right-click on the wheel). Mod+Shift+Space runs
    // `voice.sh key` instead, which also stops the captain mid-sentence.
    function setOn(value) {
        Quickshell.execDetached([root.script, value ? "on" : "off"]);
    }
    function toggle() {
        setOn(!root.on);
    }

    FileView {
        id: file
        path: Quickshell.env("HOME") + "/Projects/poormans-captain/tmp/voice/state"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: root.mode = text().trim() || "off"
        onLoadFailed: root.mode = "off"
    }

    // A watch can miss the file appearing; a cheap poll is the safety net.
    Timer {
        interval: 2000
        running: true
        repeat: true
        onTriggered: file.reload()
    }
}
