import QtQuick
import Quickshell

// One row of a tray menu: a separator, a plain/checkable item, or a submenu
// that expands inline. Submenus recurse into this same component.
Column {
    id: root

    required property QsMenuEntry entry
    // Bubbles up so the whole popup closes once something is clicked.
    signal activated()

    readonly property bool submenu: entry.hasChildren
    property bool expanded: false

    width: parent.width
    spacing: 1

    // Hairline with a bit of air above and below, instead of a full row.
    Item {
        width: parent.width
        height: root.entry.isSeparator ? 7 : 0
        visible: root.entry.isSeparator

        Rectangle {
            anchors.centerIn: parent
            width: parent.width - 12
            height: 1
            color: Theme.border
        }
    }

    Rectangle {
        id: row
        width: parent.width
        height: root.entry.isSeparator ? 0 : 28
        visible: !root.entry.isSeparator
        radius: 6
        color: rowMouse.containsMouse && root.entry.enabled ? Theme.hover : "transparent"
        Behavior on color { ColorAnimation { duration: 80 } }

        readonly property bool checked: root.entry.checkState === Qt.Checked
        readonly property color textColor: !root.entry.enabled ? Theme.dim
                                         : checked ? Theme.accent : Theme.fg

        Image {
            id: entryIcon
            anchors.left: parent.left
            anchors.leftMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            source: root.entry.icon
            visible: root.entry.icon.length > 0
            width: 14
            height: 14
            sourceSize.width: width
            sourceSize.height: height
        }

        Label {
            anchors.left: entryIcon.visible ? entryIcon.right : parent.left
            anchors.leftMargin: entryIcon.visible ? 8 : 10
            anchors.right: trailing.visible ? trailing.left : parent.right
            anchors.rightMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            text: root.entry.text
            color: row.textColor
            elide: Text.ElideRight
        }

        // Check marks and the submenu chevron never appear on the same entry,
        // so they share one right-hand slot and the labels stay left-aligned.
        Icon {
            id: trailing
            anchors.right: parent.right
            anchors.rightMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            text: root.submenu ? (root.expanded ? "󰅀" : "󰅂") // md-chevron_down / md-chevron_right
                : row.checked ? "󰄬" // md-check
                : ""
            visible: text.length > 0
            font.pixelSize: 12
            color: root.submenu ? Theme.muted : Theme.accent
        }

        MouseArea {
            id: rowMouse
            anchors.fill: parent
            hoverEnabled: true
            enabled: root.entry.enabled
            cursorShape: Qt.PointingHandCursor
            onClicked: {
                if (root.submenu) {
                    root.expanded = !root.expanded;
                } else {
                    root.entry.triggered();
                    root.activated();
                }
            }
        }
    }

    // Built only while expanded, so a collapsed submenu costs nothing and the
    // app isn't asked to keep its children up to date.
    Loader {
        width: parent.width
        active: root.expanded
        visible: active
        source: "TrayMenuSubmenu.qml"
        onLoaded: {
            item.parentEntry = root.entry;
            item.activated.connect(root.activated);
        }
    }
}
