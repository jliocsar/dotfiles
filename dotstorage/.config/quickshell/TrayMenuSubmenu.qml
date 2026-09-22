import QtQuick
import Quickshell

// Indented children of a submenu entry. Split out of TrayMenuEntry because QML
// rejects a component that names itself; going through a Loader URL breaks the
// cycle. The app only streams these entries while the opener holds the handle.
Column {
    id: root

    property QsMenuEntry parentEntry: null
    signal activated()

    width: parent.width
    leftPadding: 12
    spacing: 1

    QsMenuOpener {
        id: submenuOpener
        menu: root.parentEntry
    }

    Repeater {
        model: submenuOpener.children

        TrayMenuEntry {
            required property QsMenuEntry modelData
            entry: modelData
            width: root.width - root.leftPadding
            onActivated: root.activated()
        }
    }
}
