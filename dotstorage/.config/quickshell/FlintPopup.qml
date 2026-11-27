import QtQuick
import Quickshell

// Flint: an "Open Flint" row (the laptop's app window, flint/app.sh), then its two
// toggles, view (near | far) and theme (dark | light). Click a side to set it on the
// iPad and the app window. Under them, the captain's voice mode (off | live), which
// works with the bridge server down too.
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
        Flint.polling = visible;
        if (visible) Flint.refresh();
    }

    PopupHeader {
        icon: root.glyph
        iconColor: Flint.reachable ? Theme.cyan : Theme.dim
        title: "Flint"
        detail: Flint.reachable ? "iPad + desk" : "offline"

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
                onClicked: Flint.refresh()
            }
        }
    }

    Label {
        visible: !Flint.reachable
        text: Flint.loading ? "Checking…" : "The bridge server isn't running"
        color: Theme.muted
        height: 32
        leftPadding: 4
    }

    MenuRow {
        visible: Flint.reachable
        text: "󰏌  Open Flint"
        detail: "app window"
        onClicked: {
            Launch.cmd([Quickshell.env("HOME") + "/Projects/poormans-captain/flint/app.sh"], "flint", "");
            root.visible = false;
        }
    }

    Repeater {
        model: Flint.reachable ? root.settings : []

        Item {
            id: setting
            required property var modelData
            readonly property string current: Flint[modelData.key]
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
                                    if (setting.modelData.key === "view") Flint.setView(chip.modelData.value);
                                    else Flint.setTheme(chip.modelData.value);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // The captain's voice mode: the same two-sided switch. While it starts up or waits on an answer the live side
    // shows amber; live and ready, red.
    Item {
        id: voiceRow
        width: parent.width
        height: 38
        readonly property var options: [
            { value: false, label: "off", glyph: "󰍭" }, // md-microphone_off
            { value: true, label: "live", glyph: "󰍬" }   // md-microphone
        ]

        Label {
            anchors.left: parent.left
            anchors.leftMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            text: "Voice"
            color: Theme.muted
        }

        Rectangle {
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            width: voiceChoices.implicitWidth + 4
            height: 28
            radius: 7
            color: Theme.panelAlt

            Row {
                id: voiceChoices
                anchors.centerIn: parent
                spacing: 2

                Repeater {
                    model: voiceRow.options

                    Rectangle {
                        id: voiceChip
                        required property var modelData
                        readonly property bool isCurrent: modelData.value === VoiceMode.on
                        width: 74
                        height: 24
                        radius: 6
                        color: isCurrent ? Theme.selection : voiceMouse.containsMouse ? Theme.hover : "transparent"
                        border.width: isCurrent ? 1 : 0
                        border.color: Theme.border
                        Behavior on color { ColorAnimation { duration: 80 } }

                        Row {
                            anchors.centerIn: parent
                            spacing: 5

                            Icon {
                                anchors.verticalCenter: parent.verticalCenter
                                text: voiceChip.modelData.glyph
                                font.pixelSize: 12
                                color: !voiceChip.isCurrent ? Theme.muted
                                     : !voiceChip.modelData.value ? Theme.cyan
                                     : VoiceMode.busy ? Theme.yellow : Theme.red
                            }

                            Label {
                                anchors.verticalCenter: parent.verticalCenter
                                text: voiceChip.modelData.label
                                font.pixelSize: Theme.fontSizeSmall + 1
                                color: voiceChip.isCurrent ? Theme.fgStrong : voiceMouse.containsMouse ? Theme.fg : Theme.muted
                            }
                        }

                        MouseArea {
                            id: voiceMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: voiceChip.isCurrent ? Qt.ArrowCursor : Qt.PointingHandCursor
                            onClicked: if (!voiceChip.isCurrent) VoiceMode.setOn(voiceChip.modelData.value)
                        }
                    }
                }
            }
        }
    }
}
