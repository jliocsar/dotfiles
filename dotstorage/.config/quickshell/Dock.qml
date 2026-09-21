import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Widgets

// Bottom launcher pill. Reserves its height (windows stop above it). While the focused
// window is maximized (Mod+M) it gives that space back and slides below the screen edge.
// The window stays mapped, masked down to a 2px strip on the screen edge: resting the
// cursor there peeks the dock back over the maximized window until the cursor leaves.
PanelWindow {
    id: dock

    required property var modelData
    screen: modelData

    // Desktop entry ids, from `gsettings get io.elementary.dock launchers`.
    readonly property var launchers: [
        "com.mitchellh.ghostty",
        "google-chrome",
        "chrome-odhholcadcnnpoplnfgegfjdlemldaig-Default",
        "chrome-bgdbmehlmdmddlgneophbcddadgknlpm-Default",
        "chrome-iihaangdhkbcakicbfdgmdfijffjocfp-Default",
        "chrome-jhfaimpmnfkdmgpjnfhdancdcofhpchn-Default",
        "chrome-lkedekakimjelhmafifopephobkjkpch-Default",
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

    readonly property int edgeGap: 6
    property bool peeking: false
    readonly property bool hidden: Niri.focusedMaximized && !peeking

    anchors.bottom: true
    implicitWidth: pill.width
    // The gap below the pill is part of the surface so the peek strip sits on the screen edge.
    implicitHeight: pill.height + edgeGap
    exclusionMode: ExclusionMode.Normal
    exclusiveZone: Niri.focusedMaximized ? 0 : pill.height + edgeGap
    color: "transparent"
    mask: Region { item: dock.hidden ? peekStrip : dock.peeking ? dock.contentItem : pill }
    // Blur follows the pill (ext-background-effect), so it slides out with it instead of
    // niri blurring the whole surface rect. Regions are rect unions with no rounded-rect
    // shape, so the pill is a cross of two rects plus a circle in each corner.
    BackgroundEffect.blurRegion: Region {
        id: blurRegion
        readonly property int r: pill.radius
        x: pill.x + r
        y: pill.y
        width: pill.width - 2 * r
        height: pill.height
        regions: [
            Region { x: pill.x; y: pill.y + blurRegion.r; width: pill.width; height: pill.height - 2 * blurRegion.r },
            Region { shape: RegionShape.Ellipse; x: pill.x; y: pill.y; width: 2 * blurRegion.r; height: 2 * blurRegion.r },
            Region { shape: RegionShape.Ellipse; x: pill.x + pill.width - 2 * blurRegion.r; y: pill.y; width: 2 * blurRegion.r; height: 2 * blurRegion.r },
            Region { shape: RegionShape.Ellipse; x: pill.x; y: pill.y + pill.height - 2 * blurRegion.r; width: 2 * blurRegion.r; height: 2 * blurRegion.r },
            Region { shape: RegionShape.Ellipse; x: pill.x + pill.width - 2 * blurRegion.r; y: pill.y + pill.height - 2 * blurRegion.r; width: 2 * blurRegion.r; height: 2 * blurRegion.r }
        ]
    }
    WlrLayershell.namespace: "qs-dock"

    // Hover covers the whole surface so the dock stays peeked while the cursor rides the edge.
    HoverHandler {
        id: hover
        parent: dock.contentItem
        onHoveredChanged: if (!hovered) dock.peeking = false
    }
    // Rest on the edge for a beat before peeking, so scrolling to the bottom of a
    // maximized window doesn't summon the dock.
    Timer {
        interval: 200
        running: hover.hovered && Niri.focusedMaximized && !dock.peeking
        onTriggered: dock.peeking = true
    }
    Item {
        id: peekStrip
        anchors.bottom: parent.bottom
        width: parent.width
        height: 2
    }

    Rectangle {
        id: pill
        width: icons.width + 20
        height: icons.height + 12
        radius: 18
        color: Theme.bgPanel
        y: dock.hidden ? dock.height : 0
        Behavior on y { NumberAnimation { id: slide; duration: Theme.dockSlideMs; easing.type: Easing.InOutCubic } }
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
                        shown: mouse.containsMouse && !slide.running
                    }
                }
            }
        }
    }
}
