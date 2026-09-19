import QtQuick

// First row of a BarPopup: accent icon + bold title, muted detail on the right,
// hairline underneath.
Item {
    id: root

    property string icon: ""
    property color iconColor: Theme.accent
    property alias title: titleLabel.text
    property alias detail: detailLabel.text
    // Optional extra controls, laid out on the right before the detail text.
    default property alias controls: controlsRow.data

    width: parent.width
    height: 34

    Row {
        anchors.left: parent.left
        anchors.leftMargin: 4
        anchors.verticalCenter: parent.verticalCenter
        anchors.verticalCenterOffset: -2
        spacing: 8

        Icon {
            anchors.verticalCenter: parent.verticalCenter
            text: root.icon
            visible: root.icon.length > 0
            color: root.iconColor
        }

        Label {
            id: titleLabel
            anchors.verticalCenter: parent.verticalCenter
            color: Theme.fgStrong
            font.weight: Font.DemiBold
        }
    }

    Row {
        id: controlsRow
        anchors.right: parent.right
        anchors.rightMargin: 4
        anchors.verticalCenter: parent.verticalCenter
        anchors.verticalCenterOffset: -2
        spacing: 8

        Label {
            id: detailLabel
            anchors.verticalCenter: parent.verticalCenter
            visible: text.length > 0
            color: Theme.muted
            font.pixelSize: Theme.fontSizeSmall + 1
        }
    }

    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.border
    }
}
