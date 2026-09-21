import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Services.Pipewire
import Quickshell.Services.UPower
import Quickshell.Services.SystemTray
import Quickshell.Networking
import Quickshell.Bluetooth
import Quickshell.Widgets
import Quickshell.Io

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

    // `qs ipc call bar toggle calendar|claude|docker|wifi|power` — keybind-friendly popup toggles.
    IpcHandler {
        target: "bar"
        function toggle(name: string): void {
            const popup = { calendar, claude: claudePopup, docker: dockerPopup, wifi: wifiPopup, power: powerPopup }[name];
            if (popup) popup.visible = !popup.visible;
        }
    }

    // Background only shows behind a maximized window; otherwise the bar floats over the wallpaper.
    Rectangle {
        anchors.fill: parent
        color: Theme.bgPanel
        opacity: Niri.focusedMaximized ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Theme.dockSlideMs; easing.type: Easing.InOutCubic } }

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
        active: calendar.visible
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
            id: claudeIndicator
            icon: "\uec82" // cod-claude
            iconColor: Theme.claude
            text: ClaudeUsage.text
            color: ClaudeUsage.level === "critical" ? Theme.red
                 : ClaudeUsage.level === "warning" ? Theme.yellow
                 : ClaudeUsage.level === "unavailable" ? Theme.dim : Theme.barFg
            active: claudePopup.visible
            onClicked: claudePopup.visible = !claudePopup.visible

            ClaudePopup {
                id: claudePopup
                anchorItem: claudeIndicator
            }
        }

        Indicator {
            id: dockerIndicator
            icon: "󰡨"
            iconSize: 16
            iconColor: Theme.docker
            text: Docker.reachable ? String(Docker.containers.length) : "–"
            color: Docker.reachable ? Theme.barFg : Theme.dim
            active: dockerPopup.visible
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
            color: Stats.temperatureC >= 85 ? Theme.red : Theme.barFg
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
            color: muted ? Theme.dim : Theme.barFg
            tooltip: bar.sink?.description ?? ""
            onClicked: Quickshell.execDetached(["io.elementary.settings", "settings://sound"])

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
            readonly property WifiNetwork network: bar.wifi?.networks.values.find(candidate => candidate.connected) ?? null
            readonly property real strength: network?.signalStrength ?? 0
            icon: !bar.wifi ? "󰈀"
                : !network ? "󰤮"
                : strength < 0.2 ? "󰤯" : strength < 0.4 ? "󰤟" : strength < 0.6 ? "󰤢" : strength < 0.8 ? "󰤥" : "󰤨"
            color: network ? Theme.barFg : Theme.dim
            tooltip: network ? network.name + "  " + Math.round(strength * 100) + "%" : "not connected"
            active: wifiPopup.visible
            onClicked: wifiPopup.visible = !wifiPopup.visible

            WifiPopup {
                id: wifiPopup
                anchorItem: wifiIndicator
                device: bar.wifi
            }
        }

        Indicator {
            readonly property var connectedDevices: Bluetooth.devices.values.filter(device => device.connected)
            readonly property bool powered: Bluetooth.defaultAdapter?.enabled ?? false
            icon: !powered ? "󰂲" : connectedDevices.length > 0 ? "󰂱" : "󰂯"
            color: powered ? Theme.barFg : Theme.dim
            tooltip: connectedDevices.map(device => device.name).join("\n")
            onClicked: Quickshell.execDetached(["io.elementary.settings", "settings://network/bluetooth"])
        }

        Indicator {
            id: powerIndicator
            icon: powerPopup.active.glyph
            tooltip: powerPopup.active.label
            active: powerPopup.visible
            onClicked: powerPopup.visible = !powerPopup.visible

            PowerProfilePopup {
                id: powerPopup
                anchorItem: powerIndicator
            }
        }

        Indicator {
            text: Niri.layoutLabel
            tooltip: Niri.layoutName
            onClicked: Quickshell.execDetached(["niri", "msg", "action", "switch-layout", "next"])
        }

        Indicator {
            readonly property int percent: Math.round(bar.battery.percentage * 100)
            readonly property bool charging: bar.battery.state === UPowerDeviceState.Charging
                                          || bar.battery.state === UPowerDeviceState.FullyCharged
            visible: bar.battery.isLaptopBattery
            icon: charging ? "󰂄" : percent < 20 ? "󰁺" : percent < 40 ? "󰁼" : percent < 60 ? "󰁾" : percent < 80 ? "󰂀" : "󰁹"
            text: percent + "%"
            // Only the icon carries the level colour; the value stays neutral unless critical.
            iconColor: charging || percent >= 80 ? Theme.green : percent >= 20 ? Theme.yellow : Theme.red
            color: iconColor === Theme.red ? Theme.red : Theme.barFg
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
