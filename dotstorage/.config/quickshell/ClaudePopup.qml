import QtQuick
import Quickshell

// Usage bars for every rate-limit window Claude Code reports.
BarPopup {
    id: root

    contentWidth: 280
    spacing: 4

    PopupHeader {
        icon: "" // cod-claude
        iconColor: Theme.orange
        title: "Claude Code"
        detail: ClaudeUsage.loading ? "refreshing…"
            : ClaudeUsage.available ? "updated " + Qt.formatTime(ClaudeUsage.updatedAt, "HH:mm")
            : "unavailable"

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
                onClicked: ClaudeUsage.refresh()
            }
        }
    }

    Label {
        visible: !ClaudeUsage.available
        text: ClaudeUsage.loading ? "Reading usage…" : "Couldn't read `claude /usage`"
        color: Theme.muted
        height: 32
        leftPadding: 4
    }

    Repeater {
        model: ClaudeUsage.windows

        Item {
            required property var modelData
            width: parent.width
            height: 56

            Label {
                x: 4
                y: 6
                text: modelData.label.charAt(0).toUpperCase() + modelData.label.slice(1)
                color: Theme.fg
            }

            Label {
                anchors.right: parent.right
                anchors.rightMargin: 4
                y: 6
                text: modelData.percent + "%"
                color: ClaudeUsage.levelColor(modelData.percent)
                font.weight: Font.DemiBold
            }

            Rectangle {
                id: track
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.margins: 4
                y: 28
                height: 6
                radius: 3
                color: Theme.border

                Rectangle {
                    height: parent.height
                    width: Math.max(height, parent.width * modelData.percent / 100)
                    radius: 3
                    color: ClaudeUsage.levelColor(modelData.percent)
                    Behavior on width { NumberAnimation { duration: 240; easing.type: Easing.OutCubic } }
                }
            }

            Label {
                x: 4
                y: 40
                text: "resets " + modelData.resets
                color: Theme.muted
                font.pixelSize: Theme.fontSizeSmall
            }
        }
    }

    Label {
        visible: ClaudeUsage.activity.length > 0
        text: "Last 24h · " + ClaudeUsage.activity
        color: Theme.muted
        font.pixelSize: Theme.fontSizeSmall
        height: 24
        leftPadding: 4
    }
}
