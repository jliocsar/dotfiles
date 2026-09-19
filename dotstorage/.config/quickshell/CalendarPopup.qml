import QtQuick
import QtQuick.Controls
import Quickshell

// Month view under the clock. Scroll or use the arrows to change month.
BarPopup {
    id: root

    property date today: new Date()
    property int month: today.getMonth()
    property int year: today.getFullYear()

    function shift(months) {
        const shifted = new Date(year, month + months, 1);
        month = shifted.getMonth();
        year = shifted.getFullYear();
    }

    onVisibleChanged: {
        if (visible) {
            today = new Date();
            month = today.getMonth();
            year = today.getFullYear();
        }
    }

    contentWidth: 7 * 34

    Item {
        width: parent.width
        height: 28

        MouseArea {
            anchors.left: parent.left
            width: 28
            height: parent.height
            cursorShape: Qt.PointingHandCursor
            onClicked: root.shift(-1)
            Label { anchors.centerIn: parent; text: "‹"; color: Theme.dim }
        }

        Label {
            anchors.centerIn: parent
            text: Qt.formatDate(new Date(root.year, root.month, 1), "MMMM yyyy")
            color: Theme.blue
        }

        MouseArea {
            anchors.right: parent.right
            width: 28
            height: parent.height
            cursorShape: Qt.PointingHandCursor
            onClicked: root.shift(1)
            Label { anchors.centerIn: parent; text: "›"; color: Theme.dim }
        }
    }

    DayOfWeekRow {
        width: parent.width
        delegate: Label {
            required property var model
            text: model.shortName
            color: Theme.yellow
            horizontalAlignment: Text.AlignHCenter
            width: 34
            height: 24
        }
    }

    MonthGrid {
        id: grid
        width: parent.width
        month: root.month
        year: root.year
        delegate: Label {
            required property var model
            readonly property bool isToday: model.today
            text: model.day
            width: 34
            height: 28
            horizontalAlignment: Text.AlignHCenter
            color: !isToday && model.month !== grid.month ? Theme.dim : (isToday ? Theme.bg : Theme.white)
            font.weight: isToday ? Font.Bold : Font.Normal

            Rectangle {
                anchors.centerIn: parent
                width: 26
                height: 26
                radius: 13
                color: Theme.blue
                visible: parent.isToday
                z: -1
            }
        }

        MouseArea {
            anchors.fill: parent
            onWheel: wheel => root.shift(wheel.angleDelta.y < 0 ? 1 : -1)
        }
    }
}
