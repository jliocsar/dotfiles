import QtQuick
import Quickshell

// One bar item: nerd-font icon + value label, hover pill, tooltip, click handler.
// Either part can be empty; the Row drops hidden children from its width.
Item {
    id: root

    property string icon: ""
    property int iconSize: Theme.iconSize
    property alias text: valueLabel.text
    property color color: Theme.barFg
    // Icon defaults to the value color; brand / status icons override it.
    property color iconColor: color
    property string tooltip: ""
    // Keeps the pill lit while this item's popup is open.
    property bool active: false
    signal clicked()

    implicitWidth: row.implicitWidth + Theme.indicatorPadding * 2
    implicitHeight: Theme.barHeight

    Rectangle {
        anchors.fill: parent
        anchors.topMargin: 3
        anchors.bottomMargin: 3
        radius: 6
        color: root.active ? Theme.selection : mouse.containsMouse ? Theme.hover : "transparent"
        Behavior on color { ColorAnimation { duration: 80 } }
    }

    Row {
        id: row
        anchors.centerIn: parent
        spacing: Theme.iconGap

        Icon {
            anchors.verticalCenter: parent.verticalCenter
            text: root.icon
            visible: root.icon.length > 0
            color: root.iconColor
            font.pixelSize: root.iconSize
        }

        Label {
            id: valueLabel
            anchors.verticalCenter: parent.verticalCenter
            visible: text.length > 0
            color: root.color
            font.weight: Font.DemiBold
        }
    }

    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.clicked()
    }

    Tooltip {
        anchorItem: root
        text: root.tooltip
        shown: mouse.containsMouse && root.tooltip.length > 0 && !root.active
    }
}
