import QtQuick

// A clickable row inside a BarPopup: text on the left, muted detail on the right.
Rectangle {
    id: root

    property alias text: label.text
    property alias detail: detailLabel.text
    property color textColor: Theme.fg
    property bool selected: false
    signal clicked()

    width: parent.width
    implicitHeight: 32
    radius: 6
    color: selected ? Theme.selection : mouse.containsMouse ? Theme.hover : "transparent"
    Behavior on color { ColorAnimation { duration: 80 } }

    Label {
        id: label
        anchors.left: parent.left
        anchors.leftMargin: 10
        anchors.verticalCenter: parent.verticalCenter
        color: root.textColor
        elide: Text.ElideRight
        width: parent.width - 20 - (detailLabel.text ? detailLabel.implicitWidth + 8 : 0)
    }

    Label {
        id: detailLabel
        anchors.right: parent.right
        anchors.rightMargin: 10
        anchors.verticalCenter: parent.verticalCenter
        color: Theme.muted
        font.pixelSize: Theme.fontSizeSmall + 1
    }

    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.clicked()
    }
}
