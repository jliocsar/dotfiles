import QtQuick
import Quickshell
import Quickshell.Networking

// Wifi picker: click a network to connect, password prompt when it needs one.
BarPopup {
    id: root

    required property WifiDevice device
    property WifiNetwork pendingNetwork: null
    readonly property WifiNetwork active: device?.networks.values.find(network => network.connected) ?? null

    contentWidth: 320
    spacing: 2

    // Scan only while the popup is open.
    onVisibleChanged: {
        if (device) device.scannerEnabled = visible;
        if (!visible) pendingNetwork = null;
    }

    function pick(network) {
        pendingNetwork = null;
        if (network.connected) {
            network.disconnect();
        } else if (network.known || network.security === WifiSecurityType.Open) {
            network.connect();
        } else {
            pendingNetwork = network;
            passwordField.text = "";
            passwordField.forceActiveFocus();
        }
    }

    function submitPassword() {
        if (pendingNetwork && passwordField.text.length > 0) {
            pendingNetwork.connectWithPsk(passwordField.text);
            pendingNetwork = null;
        }
    }

    PopupHeader {
        icon: "󰤨"
        title: "Wi-Fi"
        detail: root.active ? root.active.name : "not connected"
    }

    Column {
        width: parent.width
        visible: root.pendingNetwork !== null
        spacing: 6
        topPadding: 4
        bottomPadding: 6

        Label {
            leftPadding: 4
            text: root.pendingNetwork ? "Password for " + root.pendingNetwork.name : ""
            color: Theme.muted
            font.pixelSize: Theme.fontSizeSmall + 1
        }

        Rectangle {
            width: parent.width
            height: 32
            radius: 6
            color: Theme.panelAlt
            border.width: 1
            border.color: passwordField.activeFocus ? Theme.accent : Theme.border

            TextInput {
                id: passwordField
                anchors.fill: parent
                anchors.margins: 10
                verticalAlignment: TextInput.AlignVCenter
                echoMode: TextInput.Password
                color: Theme.fgStrong
                font.family: Theme.font
                font.pixelSize: Theme.fontSize
                onAccepted: root.submitPassword()
            }
        }
    }

    Repeater {
        model: ScriptModel {
            values: [...(root.device?.networks.values ?? [])].sort((a, b) => b.signalStrength - a.signalStrength)
        }

        MenuRow {
            required property WifiNetwork modelData
            text: (modelData.connected ? "󰄬 " : (modelData.security === WifiSecurityType.Open ? "󰦞 " : "󰌾 ")) + modelData.name
            detail: modelData.stateChanging ? "…" : Math.round(modelData.signalStrength * 100) + "%"
            textColor: modelData.connected ? Theme.green : Theme.fg
            onClicked: root.pick(modelData)

            Connections {
                target: modelData
                function onConnectionFailed(reason) {
                    if (reason === ConnectionFailReason.NoSecrets) root.pick(modelData);
                }
            }
        }
    }
}
