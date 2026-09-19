import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Widgets

// Bottom launcher pill. Reserves its height (windows stop above it) and hides while
// the focused window is maximized (Mod+M), giving that space back.
PanelWindow {
    id: dock

    required property var modelData
    screen: modelData

    // Desktop entry ids, from `gsettings get io.elementary.dock launchers`.
    readonly property var launchers: [
        "com.mitchellh.ghostty",
        "google-chrome",
        "chrome-odhholcadcnnpoplnfgegfjdlemldaig-Default",
        "chrome-glhmchhhmhldpnienjeeomkojfmpbanb-Default",
        "chrome-bgdbmehlmdmddlgneophbcddadgknlpm-Default",
        "chrome-ingjcggdlomnkhehbofoppgkgcbgooil-Default",
        "chrome-iihaangdhkbcakicbfdgmdfijffjocfp-Default",
        "chrome-hnblgbbnkhihagnkijohhfhgbckjjedk-Default",
        "chrome-ehdihijdgfghmenbhgldhpmibcgmhclc-Default",
        "slack",
        "obsidian",
        "Handy",
        "tldraw-offline",
        "dev.zed.Delta",
        "dev.zed.Zed",
        "bb",
        "io.elementary.files",
        "io.elementary.settings",
        "io.elementary.monitor"
    ]

    readonly property bool hidden: Niri.focusedMaximized

    anchors.bottom: true
    margins.bottom: 6
    implicitWidth: pill.width
    implicitHeight: pill.height
    color: "transparent"
    visible: !hidden
    WlrLayershell.namespace: "qs-dock"

    Rectangle {
        id: pill
        width: icons.width + 20
        height: icons.height + 12
        radius: 18
        color: Theme.bgPanel
        border.color: Theme.border
        border.width: 1

        Row {
            id: icons
            anchors.centerIn: parent
            spacing: 10

            Repeater {
                model: dock.launchers

                Item {
                    id: launcher
                    required property string modelData
                    // Searching `applications` (not `byId`) keeps this binding live until the async scan lands.
                    readonly property var entry: DesktopEntries.applications.values.find(candidate => candidate.id === modelData) ?? null
                    width: 40
                    height: 40
                    visible: entry !== null

                    IconImage {
                        anchors.fill: parent
                        source: launcher.entry ? Quickshell.iconPath(launcher.entry.icon, "application-x-executable") : ""
                        opacity: mouse.containsMouse ? 0.7 : 1
                    }

                    MouseArea {
                        id: mouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: launcher.entry.execute()
                    }

                    Tooltip {
                        anchorItem: launcher
                        anchor.edges: Edges.Top
                        anchor.gravity: Edges.Top
                        anchor.margins.top: 0
                        anchor.margins.bottom: 10
                        text: launcher.entry?.name ?? ""
                        shown: mouse.containsMouse
                    }
                }
            }
        }
    }
}
