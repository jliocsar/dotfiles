pragma Singleton
import QtQuick
import Quickshell

// Hokum's look, for hex-dictate's windows: colours sampled from Hokum's own renders.
// Dark or light follows the `theme` command, through Theme.light.
Singleton {
    readonly property bool dark: !Theme.light

    readonly property color window: dark ? "#121212" : "#f8f8f8"
    readonly property color sidebar: dark ? "#161616" : "#ffffff"
    readonly property color section: dark ? "#161616" : "#ffffff"
    readonly property color hairline: dark ? "#282828" : "#e5e5e5"
    readonly property color selected: dark ? "#2e2e2e" : "#ebebeb"
    readonly property color hover: dark ? Qt.rgba(1, 1, 1, 0.05) : Qt.rgba(0, 0, 0, 0.04)
    readonly property color field: dark ? "#121212" : "#f8f8f8"
    readonly property color fieldFocus: dark ? "#4a4a4a" : "#b4b4b4"
    readonly property color track: dark ? "#242424" : "#f0f0f0"
    readonly property color segment: dark ? "#161616" : "#ffffff"
    readonly property color segmentEdge: dark ? "#4a4a4a" : "#c8c8c8"

    // The notification card.
    readonly property color card: dark ? "#242424" : "#fafafa"
    readonly property color cardEdge: dark ? Qt.rgba(1, 1, 1, 0.09) : Qt.rgba(0, 0, 0, 0.09)
    readonly property color cardSelected: dark ? "#313131" : "#e8e8e8"

    readonly property color text: dark ? "#fafafa" : "#161616"
    readonly property color muted: dark ? "#aeaeae" : "#5c5c5c"
    readonly property color dim: dark ? "#808080" : "#8c8c8c"
    readonly property color accent: "#4964f6"
    readonly property color danger: dark ? "#f26d6d" : "#d13b3b"

    readonly property string font: "Inter"
    readonly property int ui: 13
    readonly property int small: 12
    readonly property int heading: 20
}
