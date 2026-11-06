import QtQuick
import Quickshell
import Quickshell.Io

// The UI for hex-dictate. `qs ipc call hexDictate pick|edit`.
Scope {
    id: root

    IpcHandler {
        target: "hexDictate"

        function pick(): void {
            ModeStore.reload();
            pickerLoader.active = true;
        }

        function edit(): void {
            editorLoader.active = true;
        }
    }

    LazyLoader {
        id: pickerLoader

        ModePicker {
            onDone: Qt.callLater(() => pickerLoader.active = false)
        }
    }

    LazyLoader {
        id: editorLoader

        FloatingWindow {
            title: "Dictation modes"
            implicitWidth: 820
            implicitHeight: 620
            color: HokumStyle.window
            visible: true
            onVisibleChanged: {
                if (visible) return;
                ModeStore.flush();
                Qt.callLater(() => editorLoader.active = false);
            }

            ModeEditorView {
                anchors.fill: parent
            }
        }
    }
}
