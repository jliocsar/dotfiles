import QtQuick
import Quickshell
import Quickshell.Networking

// Wifi picker: click a network to connect, password prompt when it needs one.
BarPopup {
    id: root

    required property WifiDevice device
    property WifiNetwork pendingNetwork: null

    contentWidth: 320

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

    Label {
        text: root.device?.connected ? "Wi-Fi" : "Wi-Fi  ·  not connected"
        color: Theme.dim
        font.weight: Font.Normal
        height: 24
    }

    Column {
        width: parent.width
        visible: root.pendingNetwork !== null
        spacing: 6

        Label {
            text: root.pendingNetwork ? "Password for " + root.pendingNetwork.name : ""
        }

        Rectangle {
            width: parent.width
            height: 30
            radius: 6
            color: Qt.rgba(1, 1, 1, 0.06)
            border.color: Theme.border

            TextInput {
                id: passwordField
                anchors.fill: parent
                anchors.margins: 8
                verticalAlignment: TextInput.AlignVCenter
                echoMode: TextInput.Password
                color: Theme.white
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
            textColor: modelData.connected ? Theme.green : Theme.white
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
