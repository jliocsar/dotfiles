import QtQuick
import Quickshell

// bridge-ipad's two toggles, view (near | far) and theme (dark | light). Click a
// side to set it on the iPad.
BarPopup {
    id: root

    // md-ship_wheel: the captain's bridge.
    readonly property string glyph: "󰠳"
    readonly property var settings: [
        {
            key: "view", label: "View",
            options: [
                { value: "near", glyph: "󰕮" }, // md-view_dashboard: the detailed one
                { value: "far", glyph: "󰒹" }   // md-sofa: read from the chair
            ]
        },
        {
            key: "theme", label: "Theme",
            options: [
                { value: "dark", glyph: "󰖔" }, // md-weather_night: soft
                { value: "light", glyph: "󰏫" } // md-pencil: the pencil almanac
            ]
        }
    ]

    contentWidth: 260
    spacing: 2
    onVisibleChanged: {
        BridgeIpad.polling = visible;
        if (visible) BridgeIpad.refresh();
    }

    PopupHeader {
        icon: root.glyph
        iconColor: BridgeIpad.reachable ? Theme.cyan : Theme.dim
        title: "Bridge"
        detail: BridgeIpad.reachable ? "iPad" : "offline"

        Icon {
            anchors.verticalCenter: parent.verticalCenter
            text: "󰑐" // md-refresh
            font.pixelSize: 13
            color: refreshMouse.containsMouse ? Theme.fgStrong : Theme.muted

            MouseArea {
                id: refreshMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: BridgeIpad.refresh()
            }
        }
    }

    Label {
        visible: !BridgeIpad.reachable
        text: BridgeIpad.loading ? "Checking…" : "The bridge server isn't running"
        color: Theme.muted
        height: 32
        leftPadding: 4
    }

    Repeater {
        model: BridgeIpad.reachable ? root.settings : []

        Item {
            id: setting
            required property var modelData
            readonly property string current: BridgeIpad[modelData.key]
            width: parent.width
            height: 38

            Label {
                anchors.left: parent.left
                anchors.leftMargin: 10
                anchors.verticalCenter: parent.verticalCenter
                text: setting.modelData.label
                color: Theme.muted
            }

            // Two-sided switch: the current side raised, the other one a click away.
            Rectangle {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: choices.implicitWidth + 4
                height: 28
                radius: 7
                color: Theme.panelAlt

                Row {
                    id: choices
                    anchors.centerIn: parent
                    spacing: 2

                    Repeater {
                        model: setting.modelData.options

                        Rectangle {
                            id: chip
                            required property var modelData
                            readonly property bool isCurrent: modelData.value === setting.current
                            width: 74
                            height: 24
                            radius: 6
                            color: isCurrent ? Theme.selection : chipMouse.containsMouse ? Theme.hover : "transparent"
                            border.width: isCurrent ? 1 : 0
                            border.color: Theme.border
                            Behavior on color { ColorAnimation { duration: 80 } }

                            Row {
                                anchors.centerIn: parent
                                spacing: 5

                                Icon {
                                    anchors.verticalCenter: parent.verticalCenter
                                    text: chip.modelData.glyph
                                    font.pixelSize: 12
                                    color: chip.isCurrent ? Theme.cyan : Theme.muted
                                }

                                Label {
                                    anchors.verticalCenter: parent.verticalCenter
                                    text: chip.modelData.value
                                    font.pixelSize: Theme.fontSizeSmall + 1
                                    color: chip.isCurrent ? Theme.fgStrong : chipMouse.containsMouse ? Theme.fg : Theme.muted
                                }
                            }

                            MouseArea {
                                id: chipMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: chip.isCurrent ? Qt.ArrowCursor : Qt.PointingHandCursor
                                onClicked: {
                                    if (chip.isCurrent) return;
                                    if (setting.modelData.key === "view") BridgeIpad.setView(chip.modelData.value);
                                    else BridgeIpad.setTheme(chip.modelData.value);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
