import QtQuick
import Quickshell
import Quickshell.Wayland

// Full-screen overlay with the mode card. hex-dictate holds the transcript and gets the choice back.
PanelWindow {
    id: root

    signal done()

    screen: Quickshell.screens.find(s => s.name === Object.values(Niri.workspaces).find(w => w.focused)?.output) ?? Quickshell.screens[0]
    anchors { top: true; bottom: true; left: true; right: true }
    exclusionMode: ExclusionMode.Ignore
    color: "transparent"
    WlrLayershell.namespace: "qs-hex-dictate"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

    function finish(command: string, id: string): void {
        Quickshell.execDetached(id ? ["hex-dictate", command, id] : ["hex-dictate", command]);
        done();
    }

    // A click outside the card cancels, like Esc.
    MouseArea {
        anchors.fill: parent
        onClicked: root.finish("discard", "")
    }

    ModePickerCard {
        id: card
        anchors.centerIn: parent
        width: implicitWidth
        height: implicitHeight
        onPicked: id => root.finish("apply", id)
        onCancelled: root.finish("discard", "")
        Component.onCompleted: takeFocus()

        // Clicks inside the card shouldn't reach the cancel area behind it.
        MouseArea {
            anchors.fill: parent
            z: -1
        }
    }
}
