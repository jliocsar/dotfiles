import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Services.Pipewire
import Quickshell.Services.UPower
import Quickshell.Services.SystemTray
import Quickshell.Networking
import Quickshell.Widgets

// Top bar: nothing | clock (center) | indicators (right).
PanelWindow {
    id: bar

    required property var modelData
    screen: modelData

    anchors { top: true; left: true; right: true }
    implicitHeight: Theme.barHeight
    color: "transparent"
    WlrLayershell.namespace: "qs-bar"

    readonly property PwNode sink: Pipewire.defaultAudioSink
    readonly property WifiDevice wifi: Networking.devices.values.find(device => device.type === DeviceType.Wifi) ?? null
    readonly property UPowerDevice battery: UPower.displayDevice

    PwObjectTracker { objects: [bar.sink] }

    Rectangle {
        anchors.fill: parent
        color: Theme.bgPanel

        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: 1
            color: Theme.border
        }
    }

    SystemClock {
        id: clock
        precision: SystemClock.Minutes
    }

    Indicator {
        id: clockIndicator
        anchors.centerIn: parent
        text: Qt.formatDateTime(clock.date, "ddd MMM dd   HH:mm")
        onClicked: calendar.visible = !calendar.visible
    }

    CalendarPopup {
        id: calendar
        anchorItem: clockIndicator
    }

    Row {
        anchors.right: parent.right
        anchors.rightMargin: 4
        height: parent.height

        Indicator {
            icon: "\uec82" // cod-claude
            text: ClaudeUsage.text
            tooltip: ClaudeUsage.tooltip
            color: ClaudeUsage.level === "critical" ? Theme.red
                 : ClaudeUsage.level === "warning" ? Theme.yellow
                 : ClaudeUsage.level === "unavailable" ? Theme.dim : Theme.white
        }

        Indicator {
            id: dockerIndicator
            icon: "󰡨"
            iconSize: 18
            text: Docker.reachable ? String(Docker.containers.length) : "–"
            color: Docker.reachable ? Theme.white : Theme.dim
            tooltip: Docker.containers.map(container => container.name).join("\n")
            onClicked: dockerPopup.visible = !dockerPopup.visible

            DockerPopup {
                id: dockerPopup
                anchorItem: dockerIndicator
            }
        }

        Indicator { icon: "\uf4bc"; text: Stats.cpuPercent + "%" }
        Indicator { icon: "\uefc5"; text: Stats.memoryPercent + "%" }

        Indicator {
            icon: "󰔏"
            text: Stats.temperatureC + "°"
            color: Stats.temperatureC >= 85 ? Theme.red : Theme.white
        }

        Indicator {
            icon: "󰪛"
            visible: Stats.capsLock
            color: Theme.yellow
        }

        Indicator {
            readonly property real volume: bar.sink?.audio?.volume ?? 0
            readonly property bool muted: bar.sink?.audio?.muted ?? true
            icon: muted ? "󰖁" : volume < 0.34 ? "󰕿" : volume < 0.67 ? "󰖀" : "󰕾"
            text: muted ? "" : Math.round(volume * 100) + "%"
            color: muted ? Theme.dim : Theme.white
            tooltip: bar.sink?.description ?? ""
            onClicked: if (bar.sink?.audio) bar.sink.audio.muted = !bar.sink.audio.muted

            MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.NoButton
                onWheel: wheel => {
                    if (!bar.sink?.audio) return;
                    const step = wheel.angleDelta.y > 0 ? 0.05 : -0.05;
                    bar.sink.audio.volume = Math.max(0, Math.min(1, bar.sink.audio.volume + step));
                }
            }
        }

        Indicator {
            id: wifiIndicator
            readonly property WifiNetwork active: bar.wifi?.networks.values.find(network => network.connected) ?? null
            readonly property real strength: active?.signalStrength ?? 0
            icon: !bar.wifi ? "󰈀"
                : !active ? "󰤮"
                : strength < 0.2 ? "󰤯" : strength < 0.4 ? "󰤟" : strength < 0.6 ? "󰤢" : strength < 0.8 ? "󰤥" : "󰤨"
            color: active ? Theme.white : Theme.dim
            tooltip: active ? active.name + "  " + Math.round(strength * 100) + "%" : "not connected"
            onClicked: wifiPopup.visible = !wifiPopup.visible

            WifiPopup {
                id: wifiPopup
                anchorItem: wifiIndicator
                device: bar.wifi
            }
        }

        Indicator {
            readonly property int percent: Math.round(bar.battery.percentage * 100)
            readonly property bool charging: bar.battery.state === UPowerDeviceState.Charging
                                          || bar.battery.state === UPowerDeviceState.FullyCharged
            visible: bar.battery.isLaptopBattery
            icon: charging ? "󰂄" : percent < 20 ? "󰁺" : percent < 40 ? "󰁼" : percent < 60 ? "󰁾" : percent < 80 ? "󰂀" : "󰁹"
            text: percent + "%"
            color: charging ? Theme.green : percent <= 10 ? Theme.red : percent <= 25 ? Theme.yellow : Theme.white
            tooltip: charging
                ? (bar.battery.timeToFull > 0 ? Math.round(bar.battery.timeToFull / 60) + " min to full" : "charged")
                : (bar.battery.timeToEmpty > 0 ? Math.round(bar.battery.timeToEmpty / 60) + " min left" : "")
        }

        Row {
            height: parent.height
            spacing: 8
            leftPadding: 8
            rightPadding: 8

            Repeater {
                model: SystemTray.items

                IconImage {
                    required property SystemTrayItem modelData
                    anchors.verticalCenter: parent.verticalCenter
                    implicitSize: 20
                    source: modelData.icon

                    MouseArea {
                        anchors.fill: parent
                        acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
                        cursorShape: Qt.PointingHandCursor
                        onClicked: mouse => {
                            if (mouse.button === Qt.RightButton || modelData.onlyMenu) {
                                modelData.display(bar, bar.contentItem.mapFromItem(parent, 0, parent.height).x, Theme.barHeight);
                            } else if (mouse.button === Qt.MiddleButton) {
                                modelData.secondaryActivate();
                            } else {
                                modelData.activate();
                            }
                        }
                    }
                }
            }
        }
    }
}
