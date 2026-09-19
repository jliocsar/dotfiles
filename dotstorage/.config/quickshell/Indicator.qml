import QtQuick
import Quickshell

// One bar item: nerd-font icon + value label, hover tooltip, optional click handler.
// Either part can be empty; the Row drops hidden children from its width.
Item {
    id: root

    property string icon: ""
    property int iconSize: Theme.iconSize
    property alias text: valueLabel.text
    property color color: Theme.white
    property string tooltip: ""
    signal clicked()

    implicitWidth: row.implicitWidth + Theme.indicatorPadding * 2
    implicitHeight: Theme.barHeight

    Row {
        id: row
        anchors.centerIn: parent
        spacing: Theme.iconGap

        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: root.icon
            visible: root.icon.length > 0
            color: root.color
            font.family: Theme.iconFont
            font.pixelSize: root.iconSize
        }

        Label {
            id: valueLabel
            anchors.verticalCenter: parent.verticalCenter
            visible: text.length > 0
            color: root.color
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
        shown: mouse.containsMouse && root.tooltip.length > 0
    }
}
