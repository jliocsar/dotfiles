import QtQuick
import Quickshell

PopupWindow {
    id: root

    required property Item anchorItem
    property string text: ""
    property bool shown: false

    anchor.item: anchorItem
    anchor.edges: Edges.Bottom
    anchor.gravity: Edges.Bottom
    anchor.margins.top: 6
    visible: shown && text.length > 0
    color: "transparent"
    implicitWidth: body.implicitWidth + 20
    implicitHeight: body.implicitHeight + 12

    Rectangle {
        anchors.fill: parent
        radius: 8
        color: Theme.bgPopup
        border.color: Theme.border
        border.width: 1

        Label {
            id: body
            anchors.centerIn: parent
            text: root.text
            font.pixelSize: Theme.fontSizeSmall + 1
        }
    }
}
