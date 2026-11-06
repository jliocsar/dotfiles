import QtQuick
import QtQuick.Effects

// The mode picker's card, drawn like a notification in Hokum's Soft theme.
Item {
    id: root

    signal picked(string id)
    signal cancelled()

    readonly property var items: [...ModeStore.modes, { id: "raw", name: "Raw", description: "Paste as dictated" }]
    property int current: 0
    onItemsChanged: current = 0

    readonly property int rowHeight: 42
    implicitWidth: 360
    implicitHeight: column.implicitHeight + 24

    function takeFocus(): void {
        keys.forceActiveFocus();
    }

    function move(delta: int): void {
        if (items.length) current = (current + delta + items.length) % items.length;
    }

    function accept(): void {
        if (items[current]) picked(items[current].id);
    }

    Item {
        id: keys
        focus: true
        Keys.onPressed: event => {
            const ctrl = event.modifiers & Qt.ControlModifier;
            if (event.key === Qt.Key_Escape) root.cancelled();
            else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) root.accept();
            else if (event.key === Qt.Key_Down || event.key === Qt.Key_Tab || (ctrl && event.key === Qt.Key_N)) root.move(1);
            else if (event.key === Qt.Key_Up || event.key === Qt.Key_Backtab || (ctrl && event.key === Qt.Key_P)) root.move(-1);
            else return;
            event.accepted = true;
        }
    }

    RectangularShadow {
        anchors.fill: card
        radius: card.radius
        blur: 32
        offset.y: 8
        color: Qt.rgba(0, 0, 0, HokumStyle.dark ? 0.5 : 0.2)
    }

    Rectangle {
        id: card
        anchors.fill: parent
        radius: 16
        color: HokumStyle.card
        border.width: 1
        border.color: HokumStyle.cardEdge

        Column {
            id: column
            anchors.fill: parent
            anchors.margins: 12
            spacing: 8

            // Header, like a card's app row.
            Item {
                width: parent.width
                height: 20

                Rectangle {
                    id: badge
                    width: 20
                    height: 20
                    radius: 7
                    color: HokumStyle.accent

                    Text {
                        anchors.centerIn: parent
                        text: "\u{f036c}"
                        color: "#ffffff"
                        font.family: Theme.iconFont
                        font.pixelSize: 13
                    }
                }

                HokumText {
                    anchors.left: badge.right
                    anchors.leftMargin: 8
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Dictation"
                    color: HokumStyle.muted
                    font.weight: Font.Medium
                }

                Text {
                    id: close
                    anchors.right: parent.right
                    anchors.rightMargin: 4
                    anchors.verticalCenter: parent.verticalCenter
                    text: "×"
                    color: closeMouse.containsMouse ? HokumStyle.text : HokumStyle.dim
                    font.family: HokumStyle.font
                    font.pixelSize: 18

                    MouseArea {
                        id: closeMouse
                        anchors.fill: parent
                        anchors.margins: -6
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.cancelled()
                    }
                }
            }

            HokumText {
                width: parent.width
                height: 22
                text: "Pick a mode"
                font.pixelSize: 14
                font.weight: Font.DemiBold
            }

            ListView {
                id: list
                width: parent.width
                height: Math.min(contentHeight, root.rowHeight * 10)
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                model: root.items
                currentIndex: root.current
                highlightMoveDuration: 0

                delegate: Rectangle {
                    id: row
                    required property var modelData
                    required property int index
                    readonly property bool active: index === root.current

                    width: list.width
                    height: root.rowHeight
                    radius: 8
                    color: active ? HokumStyle.cardSelected : mouse.containsMouse ? HokumStyle.hover : "transparent"

                    Column {
                        anchors.verticalCenter: parent.verticalCenter
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.leftMargin: 8
                        anchors.rightMargin: 8
                        spacing: 1

                        HokumText {
                            width: parent.width
                            text: row.modelData.name
                            font.weight: Font.Medium
                            elide: Text.ElideRight
                        }

                        HokumText {
                            width: parent.width
                            text: row.modelData.description
                            color: HokumStyle.muted
                            font.pixelSize: HokumStyle.small
                            elide: Text.ElideRight
                        }
                    }

                    MouseArea {
                        id: mouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.picked(row.modelData.id)
                    }
                }
            }

            HokumText {
                visible: ModeStore.error !== ""
                width: parent.width
                height: visible ? 26 : 0
                text: ModeStore.error
                color: HokumStyle.danger
                font.pixelSize: HokumStyle.small
                elide: Text.ElideRight
            }
        }
    }
}
