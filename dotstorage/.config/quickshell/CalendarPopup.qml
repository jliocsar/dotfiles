import QtQuick
import QtQuick.Controls
import Quickshell

// Month view under the clock. Scroll or use the arrows to change month,
// "today" jumps back to the current one.
BarPopup {
    id: root

    property date today: new Date()
    property int month: today.getMonth()
    property int year: today.getFullYear()
    readonly property bool onCurrentMonth: month === today.getMonth() && year === today.getFullYear()
    readonly property int cellWidth: 32

    function shift(months) {
        const shifted = new Date(year, month + months, 1);
        month = shifted.getMonth();
        year = shifted.getFullYear();
    }

    function goToday() {
        today = new Date();
        month = today.getMonth();
        year = today.getFullYear();
    }

    onVisibleChanged: if (visible) goToday()

    contentWidth: 7 * cellWidth
    spacing: 2

    PopupHeader {
        icon: "󰃭" // md-calendar
        title: Qt.formatDate(new Date(root.year, root.month, 1), "MMMM yyyy")

        Label {
            anchors.verticalCenter: parent.verticalCenter
            visible: !root.onCurrentMonth
            text: "today"
            color: todayMouse.containsMouse ? Theme.fgStrong : Theme.accent
            font.pixelSize: Theme.fontSizeSmall + 1

            MouseArea {
                id: todayMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.goToday()
            }
        }

        Repeater {
            model: [{ glyph: "", step: -1 }, { glyph: "", step: 1 }]

            Rectangle {
                required property var modelData
                anchors.verticalCenter: parent.verticalCenter
                width: 22
                height: 22
                radius: 11
                color: arrowMouse.containsMouse ? Theme.hover : "transparent"

                Icon {
                    anchors.centerIn: parent
                    text: parent.modelData.glyph
                    font.pixelSize: 10
                    color: arrowMouse.containsMouse ? Theme.fgStrong : Theme.muted
                }

                MouseArea {
                    id: arrowMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.shift(parent.modelData.step)
                }
            }
        }
    }

    DayOfWeekRow {
        width: parent.width
        delegate: Label {
            required property var model
            text: model.shortName
            color: Theme.muted
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.DemiBold
            horizontalAlignment: Text.AlignHCenter
            width: root.cellWidth
            height: 24
        }
    }

    MonthGrid {
        id: grid
        width: parent.width
        month: root.month
        year: root.year
        delegate: Item {
            required property var model
            readonly property bool isToday: model.today
            readonly property bool inMonth: model.month === grid.month
            width: root.cellWidth
            height: 28

            Rectangle {
                anchors.centerIn: parent
                width: 24
                height: 24
                radius: 12
                color: Theme.accent
                visible: parent.isToday
            }

            Label {
                anchors.centerIn: parent
                text: model.day
                color: parent.isToday ? Theme.bg : parent.inMonth ? Theme.fg : Theme.dim
                font.weight: parent.isToday ? Font.Bold : Font.Normal
            }
        }

        MouseArea {
            anchors.fill: parent
            onWheel: wheel => root.shift(wheel.angleDelta.y < 0 ? 1 : -1)
        }
    }
}
