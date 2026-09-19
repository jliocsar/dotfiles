import QtQuick
import Quickshell

// Running containers; click one for logs / shell / restart / stop.
BarPopup {
    id: root

    property string selected: ""

    contentWidth: 320
    onVisibleChanged: {
        selected = "";
        if (visible) Docker.refresh();
    }

    Label {
        text: Docker.reachable ? "Running (" + Docker.containers.length + ")" : "docker unreachable"
        color: Theme.dim
        font.weight: Font.Normal
        height: 24
    }

    Label {
        visible: Docker.reachable && Docker.containers.length === 0
        text: "No containers running"
        color: Theme.fg
        font.weight: Font.Normal
        height: 28
    }

    Repeater {
        model: Docker.containers

        Column {
            required property var modelData
            width: parent.width

            MenuRow {
                text: modelData.name
                detail: modelData.status
                textColor: root.selected === modelData.name ? Theme.blue : Theme.white
                onClicked: root.selected = root.selected === modelData.name ? "" : modelData.name
            }

            Row {
                visible: root.selected === modelData.name
                spacing: 4
                leftPadding: 8
                bottomPadding: 4

                Repeater {
                    model: ["logs", "shell", "restart", "stop"]

                    Rectangle {
                        required property string modelData
                        width: actionLabel.implicitWidth + 16
                        height: 24
                        radius: 6
                        color: actionMouse.containsMouse ? Theme.blue : Qt.rgba(1, 1, 1, 0.08)

                        Label {
                            id: actionLabel
                            anchors.centerIn: parent
                            text: parent.modelData
                            font.weight: Font.Normal
                            color: actionMouse.containsMouse ? Theme.bg : Theme.white
                        }

                        MouseArea {
                            id: actionMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                const name = root.selected;
                                switch (parent.modelData) {
                                case "logs": Docker.openLogs(name); break;
                                case "shell": Docker.openShell(name); break;
                                default: Docker.act(parent.modelData, name);
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
