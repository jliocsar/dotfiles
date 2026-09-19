import QtQuick
import Quickshell

// Running containers; click one for logs / shell / restart / stop.
BarPopup {
    id: root

    property string selected: ""

    contentWidth: 320
    spacing: 2
    onVisibleChanged: {
        selected = "";
        if (visible) Docker.refresh();
    }

    // "Up 3 hours (healthy)" -> dot colour + short uptime.
    function statusColor(status) {
        if (status.includes("unhealthy")) return Theme.red;
        if (status.includes("starting") || status.startsWith("Restarting") || status.includes("Paused")) return Theme.yellow;
        if (status.startsWith("Up")) return Theme.green;
        return Theme.muted;
    }

    function uptime(status) {
        return status.replace(/^Up /, "").replace(/ \(.*\)$/, "");
    }

    PopupHeader {
        icon: "󰡨"
        iconColor: Theme.docker
        title: "Docker"
        detail: Docker.reachable ? Docker.containers.length + " running" : "unreachable"

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
                onClicked: Docker.refresh()
            }
        }
    }

    Label {
        visible: Docker.reachable && Docker.containers.length === 0
        text: "No containers running"
        color: Theme.muted
        height: 32
        leftPadding: 4
    }

    Repeater {
        model: Docker.containers

        Column {
            id: entry
            required property var modelData
            readonly property bool selected: root.selected === modelData.name
            width: parent.width

            Rectangle {
                width: parent.width
                height: 44
                radius: 6
                color: entry.selected ? Theme.selection : rowMouse.containsMouse ? Theme.hover : "transparent"
                Behavior on color { ColorAnimation { duration: 80 } }

                Rectangle {
                    anchors.left: parent.left
                    anchors.leftMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                    width: 8
                    height: 8
                    radius: 4
                    color: root.statusColor(entry.modelData.status)
                }

                Column {
                    anchors.left: parent.left
                    anchors.leftMargin: 32
                    anchors.right: uptimeLabel.left
                    anchors.rightMargin: 8
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 1

                    Label {
                        width: parent.width
                        text: entry.modelData.name
                        color: Theme.fgStrong
                        font.weight: Font.DemiBold
                        elide: Text.ElideRight
                    }

                    Label {
                        width: parent.width
                        text: entry.modelData.image
                        color: Theme.muted
                        font.pixelSize: Theme.fontSizeSmall
                        elide: Text.ElideMiddle
                    }
                }

                Label {
                    id: uptimeLabel
                    anchors.right: parent.right
                    anchors.rightMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.uptime(entry.modelData.status)
                    color: Theme.dim
                    font.pixelSize: Theme.fontSizeSmall
                }

                MouseArea {
                    id: rowMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.selected = entry.selected ? "" : entry.modelData.name
                }
            }

            Row {
                visible: entry.selected
                spacing: 6
                leftPadding: 32
                topPadding: 6
                bottomPadding: 8

                Repeater {
                    model: [
                        { name: "logs", glyph: "󰈙", danger: false },    // md-text_box
                        { name: "shell", glyph: "󰆍", danger: false },   // md-console
                        { name: "restart", glyph: "󰜉", danger: false }, // md-restart
                        { name: "stop", glyph: "󰓛", danger: true }      // md-stop
                    ]

                    Rectangle {
                        id: chip
                        required property var modelData
                        readonly property color activeColor: modelData.danger ? Theme.red : Theme.accent
                        width: chipRow.implicitWidth + 18
                        height: 24
                        radius: 6
                        color: chipMouse.containsMouse ? Theme.border : Theme.panelAlt
                        Behavior on color { ColorAnimation { duration: 80 } }

                        Row {
                            id: chipRow
                            anchors.centerIn: parent
                            spacing: 5

                            Icon {
                                anchors.verticalCenter: parent.verticalCenter
                                text: chip.modelData.glyph
                                font.pixelSize: 12
                                color: chip.activeColor
                            }

                            Label {
                                anchors.verticalCenter: parent.verticalCenter
                                text: chip.modelData.name
                                font.pixelSize: Theme.fontSizeSmall + 1
                                color: chipMouse.containsMouse ? Theme.fgStrong : Theme.fg
                            }
                        }

                        MouseArea {
                            id: chipMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                const name = root.selected;
                                switch (chip.modelData.name) {
                                case "logs": Docker.openLogs(name); break;
                                case "shell": Docker.openShell(name); break;
                                default: Docker.act(chip.modelData.name, name);
                                }
                                root.visible = false;
                            }
                        }
                    }
                }
            }
        }
    }
}
