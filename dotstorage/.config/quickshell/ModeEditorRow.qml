import QtQuick

// A row in a settings section: title and hint on the left, its control on the right.
Item {
    id: root

    property string title
    property string hint
    default property alias control: slot.data

    width: parent.width
    height: 52

    Column {
        anchors.left: parent.left
        anchors.leftMargin: 12
        anchors.verticalCenter: parent.verticalCenter
        spacing: 2

        HokumText { text: root.title }

        HokumText {
            text: root.hint
            color: HokumStyle.muted
            font.pixelSize: HokumStyle.small
        }
    }

    Item {
        id: slot
        anchors.right: parent.right
        anchors.rightMargin: 12
        anchors.verticalCenter: parent.verticalCenter
        width: childrenRect.width
        height: childrenRect.height
    }
}
