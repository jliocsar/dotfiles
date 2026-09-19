import QtQuick
import Quickshell
import Quickshell.Services.UPower

// Power profile picker (power-profiles-daemon via UPower service): click one to switch.
BarPopup {
    id: root

    // md-speedometer family for the glyphs; badge is the trailing icon in the picker.
    readonly property var profiles: [
        { value: PowerProfile.Performance, label: "Performance", glyph: "󰓅", color: Theme.red, badge: "󰉁", badgeColor: Theme.yellow }, // md-flash
        { value: PowerProfile.Balanced, label: "Balanced", glyph: "󰾅", color: Theme.accent, badge: "󰾞", badgeColor: Theme.accent }, // md-approximately_equal
        { value: PowerProfile.PowerSaver, label: "Power saver", glyph: "󰾆", color: Theme.green, badge: "󰌪", badgeColor: Theme.green } // md-leaf
    ]
    readonly property var active: profiles.find(profile => profile.value === PowerProfiles.profile)

    contentWidth: 220
    spacing: 2

    PopupHeader {
        icon: root.active.glyph
        iconColor: root.active.color
        title: "Power"
        detail: Stats.temperatureC + "°C"
    }

    Repeater {
        model: root.profiles

        Rectangle {
            id: row
            required property var modelData
            readonly property bool isActive: modelData.value === PowerProfiles.profile
            width: parent.width
            height: 32
            radius: 6
            color: isActive ? Theme.selection : rowMouse.containsMouse ? Theme.hover : "transparent"
            Behavior on color { ColorAnimation { duration: 80 } }

            // Fixed-width check slot so labels line up whether or not the row is active.
            Icon {
                anchors.left: parent.left
                anchors.leftMargin: 10
                anchors.verticalCenter: parent.verticalCenter
                text: "󰄬" // md-check
                visible: row.isActive
                font.pixelSize: 12
                color: row.modelData.color
            }

            Label {
                anchors.left: parent.left
                anchors.leftMargin: 32
                anchors.verticalCenter: parent.verticalCenter
                text: row.modelData.label
                color: row.isActive ? row.modelData.color : Theme.fg
            }

            Icon {
                anchors.right: parent.right
                anchors.rightMargin: 10
                anchors.verticalCenter: parent.verticalCenter
                text: row.modelData.badge
                visible: text.length > 0
                font.pixelSize: 13
                color: row.modelData.badgeColor
            }

            MouseArea {
                id: rowMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    PowerProfiles.profile = row.modelData.value;
                    root.visible = false;
                }
            }
        }
    }
}
