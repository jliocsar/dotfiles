import QtQuick
import Quickshell
import Quickshell.Services.SystemTray

// A tray item's own menu, rendered with the bar's palette instead of the
// default Qt widget menu. The app streams its entries over DBus for as long as
// the opener below references the handle.
BarPopup {
    id: root

    required property SystemTrayItem item

    contentWidth: 240
    padding: 6
    spacing: 1

    QsMenuOpener {
        id: menuOpener
        menu: root.item.menu
    }

    Repeater {
        model: menuOpener.children

        TrayMenuEntry {
            required property QsMenuEntry modelData
            entry: modelData
            onActivated: root.visible = false
        }
    }
}
