import QtQuick
import Quickshell

// Click-to-open panel under a bar item. Closes on click outside.
PopupWindow {
    id: root

    required property Item anchorItem
    default property alias content: contentColumn.data
    property int contentWidth: 300
    property int padding: 10
    property alias spacing: contentColumn.spacing

    anchor.item: anchorItem
    anchor.edges: Edges.Bottom
    anchor.gravity: Edges.Bottom
    anchor.margins.top: 6
    grabFocus: true
    color: "transparent"
    implicitWidth: contentWidth + padding * 2
    implicitHeight: contentColumn.implicitHeight + padding * 2

    Rectangle {
        anchors.fill: parent
        radius: Theme.radius
        color: Theme.bgPopup
        border.color: Theme.border
        border.width: 1

        Column {
            id: contentColumn
            anchors.fill: parent
            anchors.margins: root.padding
            spacing: 6
        }
    }
}
