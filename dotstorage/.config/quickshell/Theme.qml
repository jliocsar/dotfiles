pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// Delta One palette (same tokens as the ghostty / hunk / Claude themes).
// Follows the `theme` command's mode file, so the bar flips dark/light with
// everything else on this machine.
Singleton {
    id: root

    property string mode: "dark"
    readonly property bool light: mode === "light"

    FileView {
        id: modeFile
        path: (Quickshell.env("XDG_STATE_HOME") || Quickshell.env("HOME") + "/.local/state") + "/theme/mode"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: root.mode = text().trim()
    }

    // `theme` replaces the file by rename, which can drop the inotify watch;
    // a slow poll is a cheap safety net.
    Timer {
        interval: 5000
        running: true
        repeat: true
        onTriggered: modeFile.reload()
    }

    // Surfaces
    readonly property color bg: light ? "#fafafa" : "#191c1f"
    readonly property color panel: light ? "#ebebec" : "#202327"
    readonly property color panelAlt: light ? "#dfdfe0" : "#22252a"
    readonly property color border: light ? "#c9c9ca" : "#32363e"
    readonly property color selection: light ? "#d4dbf4" : "#2f3f4f"
    readonly property color hover: light ? Qt.rgba(0, 0, 0, 0.06) : Qt.rgba(1, 1, 1, 0.07)
    // Low alpha on purpose: niri blurs what sits behind these (layer-rule in its config).
    readonly property color bgPanel: Qt.alpha(bg, 0.6)
    readonly property color bgPopup: Qt.alpha(panel, 0.85)

    // Text
    readonly property color fg: light ? "#4d4f52" : "#acb2be"
    readonly property color fgStrong: light ? "#242529" : "#dce0e5"
    readonly property color muted: light ? "#7e8086" : "#878a98"
    readonly property color dim: light ? "#a2a3a7" : "#5d636f"
    // Bar indicators read best in plain white on the dark panel.
    readonly property color barFg: light ? fgStrong : "#fafafa"

    // Accents (Delta's badge / file-status tokens, tuned for UI text)
    readonly property color accent: light ? "#5c78e2" : "#74ade8"
    readonly property color red: light ? "#d36151" : "#d07277"
    readonly property color green: light ? "#669f59" : "#a1c181"
    readonly property color yellow: light ? "#a48819" : "#dec184"
    readonly property color orange: light ? "#ad6e25" : "#bf956a"
    readonly property color purple: light ? "#a449ab" : "#b477cf"
    readonly property color cyan: light ? "#3882b7" : "#6eb4bf"

    // Brand icons: halfway between the brand color and the palette's closest accent.
    readonly property color claude: mix(orange, Qt.lighter("#DE7356", 1.1))
    readonly property color docker: mix(accent, Qt.lighter("#1D63ED", 1.3))

    function mix(a, b) {
        return Qt.rgba((a.r + b.r) / 2, (a.g + b.g) / 2, (a.b + b.b) / 2, 1);
    }

    readonly property string font: "SF Pro"
    readonly property string iconFont: "Symbols Nerd Font Mono"
    readonly property int fontSize: 13
    readonly property int fontSizeSmall: 11
    readonly property int iconSize: 14
    // Gap between an indicator's icon and its value, and padding on each side of it.
    readonly property int iconGap: 6
    readonly property int indicatorPadding: 8
    readonly property int barHeight: 28
    readonly property int radius: 10
    readonly property int dockSlideMs: 220
}
