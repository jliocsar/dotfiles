import QtQuick

// A clickable row inside a Popup.
Rectangle {
    id: root

    property alias text: label.text
    property alias detail: detailLabel.text
    property color textColor: Theme.white
    signal clicked()

    width: parent.width
    implicitHeight: 30
    radius: 6
    color: mouse.containsMouse ? Qt.rgba(1, 1, 1, 0.08) : "transparent"

    Label {
        id: label
        anchors.left: parent.left
        anchors.leftMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        color: root.textColor
        elide: Text.ElideRight
        width: parent.width - 16 - (detailLabel.text ? detailLabel.implicitWidth + 8 : 0)
    }

    Label {
        id: detailLabel
        anchors.right: parent.right
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        color: Theme.dim
        font.weight: Font.Normal
    }

    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.clicked()
    }
}
