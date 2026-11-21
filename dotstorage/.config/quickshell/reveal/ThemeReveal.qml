import QtQuick
import QtQuick.Effects
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

// One reveal per process. ~/.local/bin/theme starts this shell, which freezes
// every output on its current frame right away, then:
//
//   qs -p ~/.config/quickshell/reveal ipc call themeReveal frozen      true once every frame is up
//   (theme flips everything underneath)
//   qs -p ~/.config/quickshell/reveal ipc call themeReveal reveal X Y  open a circle at global X,Y
//   qs -p ~/.config/quickshell/reveal ipc call themeReveal cancel      quit now
//
// The overlay takes no input (empty mask, no keyboard focus) and can't stick:
// the process quits when the circle is open, and safetyMs after it started
// whatever else happens.
Scope {
    id: root

    // Whatever happens, the process is gone this long after it started.
    readonly property int safetyMs: 2000
    // Let ghostty's reload and the portal apps' repaint land before opening.
    readonly property int settleMs: 90
    readonly property int revealMs: 350

    property int framesReady: 0
    // The circle's centre, in global logical coordinates (niri's layout space).
    property real originX: 0
    property real originY: 0
    // 0 → 1 over the reveal. Each output scales it by its own reach, so every
    // output finishes together instead of the near one clearing early.
    property real progress: 0

    function finish(): void {
        grow.stop();
        Qt.quit();
    }

    IpcHandler {
        target: "themeReveal"

        function frozen(): bool {
            return root.framesReady >= Quickshell.screens.length;
        }

        function reveal(x: int, y: int): void {
            root.originX = x;
            root.originY = y;
            grow.restart();
        }

        function cancel(): void {
            root.finish();
        }
    }

    Timer {
        running: true
        interval: root.safetyMs
        onTriggered: root.finish()
    }

    SequentialAnimation {
        id: grow
        PauseAnimation { duration: root.settleMs }
        NumberAnimation {
            target: root
            property: "progress"
            from: 0
            to: 1
            duration: root.revealMs
            easing.type: Easing.OutCubic
        }
        ScriptAction { script: root.finish() }
    }

    Variants {
        model: Quickshell.screens

        PanelWindow {
            id: win

            required property ShellScreen modelData

            screen: modelData
            color: "transparent"
            anchors { top: true; bottom: true; left: true; right: true }
            exclusionMode: ExclusionMode.Ignore
            // Empty input region: clicks and scrolls go straight through.
            mask: Region {}
            WlrLayershell.layer: WlrLayer.Overlay
            WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
            WlrLayershell.namespace: "qs-theme-reveal"

            // One still frame of this output, taken as the window is built.
            ScreencopyView {
                id: frame
                anchors.fill: parent
                captureSource: win.modelData
                live: false
                paintCursor: false
                visible: false
                layer.enabled: true
                onHasContentChanged: if (hasContent) root.framesReady++
            }

            // The hole: a disc at the origin, in this output's own coordinates.
            // Calling a typed function with a ShellScreen from a binding here
            // crashed quickshell at load, so the reach is spelled out inline.
            Item {
                id: hole
                anchors.fill: parent
                visible: false
                layer.enabled: true

                Rectangle {
                    readonly property real localX: root.originX - win.modelData.x
                    readonly property real localY: root.originY - win.modelData.y
                    // Far enough from the origin to clear this output's farthest corner.
                    readonly property real reach: Math.hypot(
                        Math.max(Math.abs(localX), Math.abs(localX - win.width)),
                        Math.max(Math.abs(localY), Math.abs(localY - win.height)))
                    readonly property real r: root.progress * reach

                    x: localX - r
                    y: localY - r
                    width: r * 2
                    height: r * 2
                    radius: r
                    color: "black"
                }
            }

            // The frozen frame everywhere but the hole.
            MultiEffect {
                anchors.fill: parent
                source: frame
                maskEnabled: true
                maskSource: hole
                maskInverted: true
            }
        }
    }
}
