import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Widgets
import Quickshell.Services.Notifications

// Notification daemon (replaces mako). Each card gets its own rounded blur
// region through ext-background-effect, so the gaps between cards stay clear.
PanelWindow {
    id: root

    readonly property int cardWidth: 360
    readonly property int cardGap: 8
    // Used when the sender doesn't ask for a timeout (expireTimeout <= 0).
    readonly property int defaultTimeoutMs: 15000

    anchors { top: true; right: true }
    margins { top: 12; right: 12 }
    exclusionMode: ExclusionMode.Normal
    exclusiveZone: 0
    implicitWidth: cardWidth
    implicitHeight: Math.max(cardColumn.implicitHeight, 1)
    visible: cardRepeater.count > 0
    color: "transparent"
    WlrLayershell.namespace: "qs-notifications"

    // Union of every card, rounded like the cards. Rebuilt as cards come and go.
    property list<Region> cardShapes: []
    Region {
        id: cardsRegion
        regions: root.cardShapes
    }
    BackgroundEffect.blurRegion: cardsRegion
    // Clicks in the gaps fall through to whatever is underneath.
    mask: cardsRegion

    function rebuildCardShapes(removedCard) {
        const shapes = [];
        for (let index = 0; index < cardRepeater.count; index++) {
            const card = cardRepeater.itemAt(index);
            if (card && card !== removedCard) shapes.push(card.blurShape);
        }
        cardShapes = shapes;
    }

    NotificationServer {
        id: server
        keepOnReload: true
        actionsSupported: true
        bodyMarkupSupported: true
        imageSupported: true
        onNotification: notification => notification.tracked = true
    }

    Column {
        id: cardColumn
        width: root.cardWidth
        spacing: root.cardGap

        Repeater {
            id: cardRepeater
            model: server.trackedNotifications
            onItemAdded: root.rebuildCardShapes(null)
            onItemRemoved: (index, item) => root.rebuildCardShapes(item)

            delegate: Rectangle {
                id: card

                required property Notification modelData
                readonly property Notification notification: modelData
                readonly property bool critical: notification.urgency === NotificationUrgency.Critical
                readonly property var defaultAction: notification.actions.find(action => action.identifier === "default") ?? null
                readonly property var buttonActions: notification.actions.filter(action => action.identifier !== "default")
                // Raw image paths come without a scheme; icon names go through the icon theme.
                readonly property string iconSource: {
                    const source = notification.image || notification.appIcon;
                    if (source === "") return "";
                    if (source.startsWith("/")) return "file://" + source;
                    if (source.includes("://")) return source;
                    return Quickshell.iconPath(source, true);
                }
                property Region blurShape: Region { item: card; radius: Theme.radius }

                width: root.cardWidth
                implicitHeight: cardContent.implicitHeight + 24
                radius: Theme.radius
                color: Theme.bgPopup
                border.width: 1
                border.color: critical ? Theme.red : Theme.border

                // expireTimeout is the raw D-Bus value in ms (quickshell's doc says seconds, its code doesn't).
                Timer {
                    interval: card.notification.expireTimeout > 0 ? card.notification.expireTimeout : root.defaultTimeoutMs
                    running: !card.critical && !cardHover.hovered
                    onTriggered: card.notification.expire()
                }

                HoverHandler { id: cardHover }

                // Left click runs the default action (if any) and closes; any other button just closes.
                TapHandler {
                    acceptedButtons: Qt.AllButtons
                    onTapped: (eventPoint, button) => {
                        if (button === Qt.LeftButton && card.defaultAction) card.defaultAction.invoke();
                        card.notification.dismiss();
                    }
                }

                Row {
                    id: cardContent
                    x: 12
                    y: 12
                    width: parent.width - 24
                    spacing: 10

                    IconImage {
                        visible: card.iconSource !== ""
                        source: card.iconSource
                        implicitSize: 32
                    }

                    Column {
                        width: parent.width - (card.iconSource !== "" ? 42 : 0)
                        spacing: 2

                        Label {
                            width: parent.width
                            text: card.notification.summary || card.notification.appName
                            color: Theme.fgStrong
                            font.weight: Font.DemiBold
                            elide: Text.ElideRight
                        }

                        Label {
                            width: parent.width
                            visible: text !== ""
                            text: card.notification.body
                            textFormat: Text.StyledText
                            font.pixelSize: Theme.fontSize - 1
                            wrapMode: Text.Wrap
                            maximumLineCount: 4
                            elide: Text.ElideRight
                        }

                        Row {
                            visible: card.buttonActions.length > 0
                            topPadding: 6
                            spacing: 6

                            Repeater {
                                model: card.buttonActions

                                delegate: Rectangle {
                                    id: actionButton
                                    required property var modelData
                                    implicitWidth: actionLabel.implicitWidth + 16
                                    implicitHeight: actionLabel.implicitHeight + 8
                                    radius: 6
                                    color: actionHover.hovered ? Theme.hover : "transparent"
                                    border.width: 1
                                    border.color: Theme.border

                                    Label {
                                        id: actionLabel
                                        anchors.centerIn: parent
                                        text: actionButton.modelData.text
                                        font.pixelSize: Theme.fontSizeSmall
                                    }

                                    HoverHandler { id: actionHover }
                                    // Takes the tap before the card's handler, so the card doesn't also run the default action.
                                    TapHandler {
                                        gesturePolicy: TapHandler.ReleaseWithinBounds
                                        grabPermissions: PointerHandler.CanTakeOverFromAnything
                                        onTapped: {
                                            actionButton.modelData.invoke();
                                            card.notification.dismiss();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
