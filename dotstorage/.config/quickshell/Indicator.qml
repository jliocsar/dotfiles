import QtQuick
// import QtQuick.Effects
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
    // A small dot after the icon / value (the captain's voice mode on the bridge wheel); transparent = none.
    // dotBlink pulses it (loading), dotRipple sends a ring out of it (speaking).
    property color dot: "transparent"
    property bool dotBlink: false
    property bool dotRipple: false
    // Keeps the pill lit while this item's popup is open.
    property bool active: false
    readonly property bool hovered: mouse.containsMouse
    signal clicked()
    signal rightClicked()

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
        // layer.enabled: true
        // layer.effect: BarShadow {}

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

        Item {
            anchors.verticalCenter: parent.verticalCenter
            visible: root.dot.a > 0
            width: 6
            height: 6

            Rectangle {
                anchors.fill: parent
                radius: 3
                color: root.dot
                Behavior on color { ColorAnimation { duration: 120 } }

                SequentialAnimation on opacity {
                    running: root.dotBlink && root.dot.a > 0
                    loops: Animation.Infinite
                    alwaysRunToEnd: true
                    NumberAnimation { to: 0.25; duration: 550; easing.type: Easing.InOutSine }
                    NumberAnimation { to: 1; duration: 550; easing.type: Easing.InOutSine }
                }
            }

            Rectangle {
                id: ripple
                anchors.centerIn: parent
                width: 6
                height: 6
                radius: 3
                color: "transparent"
                border.color: root.dot
                border.width: 1.5
                opacity: 0
                visible: root.dotRipple

                ParallelAnimation {
                    running: root.dotRipple && root.dot.a > 0
                    loops: Animation.Infinite
                    NumberAnimation { target: ripple; property: "scale"; from: 1; to: 2.6; duration: 1200; easing.type: Easing.OutQuad }
                    NumberAnimation { target: ripple; property: "opacity"; from: 0.9; to: 0; duration: 1200 }
                }
            }
        }
    }

    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: mouse => mouse.button === Qt.RightButton ? root.rightClicked() : root.clicked()
    }

    Tooltip {
        anchorItem: root
        text: root.tooltip
        shown: mouse.containsMouse && root.tooltip.length > 0 && !root.active
    }
}
