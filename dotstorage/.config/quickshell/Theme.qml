pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// Palettes per family (delta-one / zenbones) and mode, same tokens as the
// ghostty / hunk / Claude themes. Follows the `theme` command's state files,
// so the bar flips with everything else on this machine.
Singleton {
    id: root

    readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || Quickshell.env("HOME") + "/.local/state") + "/theme"
    property string mode: "dark"
    property string family: "delta-one"
    readonly property bool light: mode === "light"

    FileView {
        id: modeFile
        path: root.stateDir + "/mode"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: root.mode = text().trim()
    }

    FileView {
        id: familyFile
        path: root.stateDir + "/family"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: root.family = text().trim()
    }

    // `theme` replaces the files by rename, which can drop the inotify watch;
    // a slow poll is a cheap safety net.
    Timer {
        interval: 5000
        running: true
        repeat: true
        onTriggered: {
            modeFile.reload();
            familyFile.reload();
        }
    }

    // Accents are each palette's badge / file-status tokens, tuned for UI text.
    // Zenbones has no yellow; its ANSI yellow slot is wood, so yellow = wood.
    readonly property var palettes: ({
        "delta-one": {
            dark: {
                bg: "#191c1f", panel: "#202327", panelAlt: "#22252a", border: "#32363e", selection: "#2f3f4f",
                fg: "#acb2be", fgStrong: "#dce0e5", muted: "#878a98", dim: "#5d636f", barFg: "#fafafa",
                accent: "#74ade8", red: "#d07277", green: "#a1c181", yellow: "#dec184",
                orange: "#bf956a", purple: "#b477cf", cyan: "#6eb4bf"
            },
            light: {
                bg: "#fafafa", panel: "#ebebec", panelAlt: "#dfdfe0", border: "#c9c9ca", selection: "#d4dbf4",
                fg: "#4d4f52", fgStrong: "#242529", muted: "#7e8086", dim: "#a2a3a7", barFg: "#242529",
                accent: "#5c78e2", red: "#d36151", green: "#669f59", yellow: "#a48819",
                orange: "#ad6e25", purple: "#a449ab", cyan: "#3882b7"
            }
        },
        "zenbones": {
            // Muted tiers match herdr's: a step brighter than zenbones.nvim's
            // because the blurred bar sits over darker-than-spec surfaces.
            dark: {
                bg: "#1c1917", panel: "#25211f", panelAlt: "#302b29", border: "#403833", selection: "#3d4042",
                fg: "#b4bdc3", fgStrong: "#c4cacf", muted: "#979fa4", dim: "#7a716c", barFg: "#f0edec",
                accent: "#b77e64", red: "#de6e7c", green: "#819b69", yellow: "#b77e64",
                orange: "#d68c67", purple: "#b279a7", cyan: "#66a5ad"
            },
            light: {
                bg: "#f0edec", panel: "#e9e4e2", panelAlt: "#ddd6d3", border: "#cfc1ba", selection: "#ded6d1",
                fg: "#44525b", fgStrong: "#2c363c", muted: "#8e817b", dim: "#a4968f", barFg: "#2c363c",
                accent: "#944927", red: "#a8334c", green: "#4f6c31", yellow: "#944927",
                orange: "#803d1c", purple: "#88507d", cyan: "#3b8992"
            }
        }
    })
    // Unknown family (or no state file yet) falls back to Delta One.
    readonly property var palette: (palettes[family] || palettes["delta-one"])[light ? "light" : "dark"]

    // Surfaces
    readonly property color bg: palette.bg
    readonly property color panel: palette.panel
    readonly property color panelAlt: palette.panelAlt
    readonly property color border: palette.border
    readonly property color selection: palette.selection
    readonly property color hover: light ? Qt.rgba(0, 0, 0, 0.06) : Qt.rgba(1, 1, 1, 0.07)
    // Low alpha on purpose: niri blurs what sits behind these (layer-rule in its config).
    readonly property color bgPanel: Qt.alpha(bg, 0.6)
    readonly property color bgPopup: Qt.alpha(panel, 0.85)

    // Text
    readonly property color fg: palette.fg
    readonly property color fgStrong: palette.fgStrong
    readonly property color muted: palette.muted
    readonly property color dim: palette.dim
    // Bar indicators read best in near-white on the dark panel.
    readonly property color barFg: palette.barFg
    // Drop shadow behind bar text/icons, so they read over any wallpaper.
    readonly property color barShadow: light ? Qt.rgba(1, 1, 1, 0.6) : Qt.rgba(0, 0, 0, 0.7)

    // Accents
    readonly property color accent: palette.accent
    readonly property color red: palette.red
    readonly property color green: palette.green
    readonly property color yellow: palette.yellow
    readonly property color orange: palette.orange
    readonly property color purple: palette.purple
    readonly property color cyan: palette.cyan

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