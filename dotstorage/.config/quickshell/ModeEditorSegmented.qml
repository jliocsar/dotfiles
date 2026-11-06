import QtQuick

// Hokum's segmented control: a flat track, the chosen segment raised with a hairline.
Rectangle {
    id: root

    property var options: []
    property string current: ""
    property int segmentWidth: 78
    signal selected(string value)

    width: options.length * segmentWidth
    height: 28
    radius: 8
    color: HokumStyle.track

    Row {
        anchors.fill: parent

        Repeater {
            model: root.options

            Rectangle {
                id: segment
                required property string modelData
                readonly property bool active: modelData === root.current

                width: root.segmentWidth
                height: root.height
                radius: 8
                color: active ? HokumStyle.segment : mouse.containsMouse ? HokumStyle.hover : "transparent"
                border.width: active ? 1 : 0
                border.color: HokumStyle.segmentEdge

                HokumText {
                    anchors.centerIn: parent
                    text: segment.modelData.charAt(0).toUpperCase() + segment.modelData.slice(1)
                    color: segment.active ? HokumStyle.text : HokumStyle.muted
                }

                MouseArea {
                    id: mouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.selected(segment.modelData)
                }
            }
        }
    }
}
