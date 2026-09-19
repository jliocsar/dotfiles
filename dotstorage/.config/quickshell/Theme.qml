pragma Singleton
import QtQuick

// Delta One Dark, same palette as the ghostty theme.
QtObject {
    readonly property color bg: "#191c1f"
    readonly property color bgPanel: Qt.rgba(25 / 255, 28 / 255, 31 / 255, 0.85)
    readonly property color bgPopup: Qt.rgba(25 / 255, 28 / 255, 31 / 255, 0.96)
    readonly property color fg: "#abb2bf"
    readonly property color white: "#fafafa"
    readonly property color dim: "#636d83"
    readonly property color blue: "#61afef"
    readonly property color red: "#e06c75"
    readonly property color green: "#98c379"
    readonly property color yellow: "#e5c07b"
    readonly property color border: Qt.rgba(1, 1, 1, 0.08)

    readonly property string font: "SF Pro"
    readonly property string iconFont: "Symbols Nerd Font Mono"
    readonly property int fontSize: 13
    readonly property int iconSize: 14
    // Gap between an indicator's icon and its value, and padding on each side of it.
    readonly property int iconGap: 7
    readonly property int indicatorPadding: 8
    readonly property int barHeight: 28
    readonly property int radius: 10
}
