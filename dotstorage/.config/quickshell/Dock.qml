import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Widgets

// Bottom launcher pill. Reserves its height (windows stop above it). While the focused
// window is maximized (Mod+M) it gives that space back and slides below the screen edge.
// The window stays mapped, masked down to a 2px strip on the screen edge: resting the
// cursor there peeks the dock back over the maximized window until the cursor leaves.
PanelWindow {
    id: dock

    required property var modelData
    screen: modelData

    // Pinned desktop entry ids, in dock order. Lives in dock-pins.json (tracked in the
    // dotfiles) so right-click pin/unpin and drag-to-reorder can write it back.
    property var launchers: []

    FileView {
        id: pinsFile
        path: Quickshell.shellDir + "/dock-pins.json"
        watchChanges: true
        // In-place writes keep the inotify watch alive, so the other screens' docks follow along.
        atomicWrites: false
        onFileChanged: reload()
        onLoaded: {
            try {
                const parsed = JSON.parse(text());
                if (!Array.isArray(parsed)) console.warn("dock-pins.json: expected an array of desktop entry ids");
                // Our own saves echo back through the watch; reassigning would rebuild every icon.
                else if (parsed.join("\n") !== dock.launchers.join("\n")) dock.launchers = parsed;
            } catch (error) {
                console.warn("dock-pins.json:", error);
            }
        }
        onSaveFailed: error => console.warn("dock-pins.json: save failed:", FileViewError.toString(error))
    }

    function savePins(nextPins) {
        dock.launchers = nextPins;
        pinsFile.setText(JSON.stringify(nextPins, null, 2) + "\n");
    }

    function togglePin(entryId) {
        savePins(launchers.includes(entryId) ? launchers.filter(pinnedId => pinnedId !== entryId) : launchers.concat([entryId]));
    }

    function movePin(fromIndex, toIndex) {
        const nextPins = launchers.slice();
        nextPins.splice(toIndex, 0, nextPins.splice(fromIndex, 1)[0]);
        savePins(nextPins);
    }

    // Drag-to-reorder: the dragged icon follows the cursor and the ones it passes slide
    // over to open a gap. The pins only change on drop, so delegates survive the drag.
    readonly property int iconStep: 50 // icon width + Row spacing
    property int dragFromIndex: -1
    property real dragOffsetX: 0
    readonly property int dragToIndex: dragFromIndex === -1 ? -1
        : Math.max(0, Math.min(launchers.length - 1, dragFromIndex + Math.round(dragOffsetX / iconStep)))

    function finishDrag() {
        const fromIndex = dragFromIndex;
        const toIndex = dragToIndex;
        dragFromIndex = -1;
        dragOffsetX = 0;
        if (fromIndex !== toIndex) movePin(fromIndex, toIndex);
    }

    // Right-click menu target: the icon delegate the menu is anchored to.
    property Item menuTarget: null

    function openMenu(item) {
        menuTarget = item;
        menu.visible = true;
    }

    // Open windows grouped by desktop entry id (raw app id when no entry matches),
    // so pinned launchers get running dots and unpinned apps still show up.
    readonly property var windowIdsByEntryId: {
        // Touching `applications` re-runs this once the async desktop entry scan lands.
        if (DesktopEntries.applications.values.length === 0) return {};
        const grouped = {};
        for (const [windowId, window] of Object.entries(Niri.windows)) {
            if (window.appId === "") continue;
            const entryId = DesktopEntries.heuristicLookup(window.appId)?.id ?? window.appId;
            if (grouped[entryId] === undefined) grouped[entryId] = [];
            grouped[entryId].push(Number(windowId));
        }
        return grouped;
    }
    // Only reassigned when the list really changes: niri events land constantly, and a new
    // array makes the Repeater rebuild every unpinned icon, eating clicks mid-press.
    property var unpinnedEntryIds: []
    function refreshUnpinned() {
        const nextUnpinned = Object.keys(windowIdsByEntryId).filter(entryId => !launchers.includes(entryId));
        if (nextUnpinned.join("\n") !== unpinnedEntryIds.join("\n")) unpinnedEntryIds = nextUnpinned;
    }
    onWindowIdsByEntryIdChanged: refreshUnpinned()
    onLaunchersChanged: refreshUnpinned()

    readonly property int edgeGap: 6
    property bool peeking: false
    readonly property bool hidden: Niri.focusedMaximized && !peeking

    anchors.bottom: true
    implicitWidth: pill.width
    // The gap below the pill is part of the surface so the peek strip sits on the screen edge.
    implicitHeight: pill.height + edgeGap
    exclusionMode: ExclusionMode.Normal
    exclusiveZone: Niri.focusedMaximized ? 0 : pill.height + edgeGap
    color: "transparent"
    mask: Region { item: dock.hidden ? peekStrip : dock.peeking ? dock.contentItem : pill }
    // Blur follows the pill (ext-background-effect), so it slides out with it instead of
    // niri blurring the whole surface rect. Regions are rect unions with no rounded-rect
    // shape, so the pill is a cross of two rects plus a circle in each corner.
    BackgroundEffect.blurRegion: Region {
        id: blurRegion
        readonly property int r: pill.radius
        x: pill.x + r
        y: pill.y
        width: pill.width - 2 * r
        height: pill.height
        regions: [
            Region { x: pill.x; y: pill.y + blurRegion.r; width: pill.width; height: pill.height - 2 * blurRegion.r },
            Region { shape: RegionShape.Ellipse; x: pill.x; y: pill.y; width: 2 * blurRegion.r; height: 2 * blurRegion.r },
            Region { shape: RegionShape.Ellipse; x: pill.x + pill.width - 2 * blurRegion.r; y: pill.y; width: 2 * blurRegion.r; height: 2 * blurRegion.r },
            Region { shape: RegionShape.Ellipse; x: pill.x; y: pill.y + pill.height - 2 * blurRegion.r; width: 2 * blurRegion.r; height: 2 * blurRegion.r },
            Region { shape: RegionShape.Ellipse; x: pill.x + pill.width - 2 * blurRegion.r; y: pill.y + pill.height - 2 * blurRegion.r; width: 2 * blurRegion.r; height: 2 * blurRegion.r }
        ]
    }
    WlrLayershell.namespace: "qs-dock"

    // Hover covers the whole surface so the dock stays peeked while the cursor rides the edge.
    HoverHandler {
        id: hover
        parent: dock.contentItem
        onHoveredChanged: if (!hovered) dock.peeking = false
    }
    // Rest on the edge for a beat before peeking, so scrolling to the bottom of a
    // maximized window doesn't summon the dock.
    Timer {
        interval: 200
        running: hover.hovered && Niri.focusedMaximized && !dock.peeking
        onTriggered: dock.peeking = true
    }
    Item {
        id: peekStrip
        anchors.bottom: parent.bottom
        width: parent.width
        height: 2
    }

    Rectangle {
        id: pill
        width: icons.width + 20
        height: icons.height + 12
        radius: 18
        color: Theme.bgPanel
        y: dock.hidden ? dock.height : 0
        Behavior on y { NumberAnimation { id: slide; duration: Theme.dockSlideMs; easing.type: Easing.InOutCubic } }
        border.color: Theme.border
        border.width: 1

        Row {
            id: icons
            anchors.centerIn: parent
            spacing: 10

            Repeater {
                model: dock.launchers
                delegate: dockItemDelegate
            }

            Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                width: 1
                height: 28
                color: Theme.border
                visible: dock.unpinnedEntryIds.length > 0
            }

            Repeater {
                model: dock.unpinnedEntryIds
                delegate: dockItemDelegate
            }
        }
    }

    // One dock icon. Click focuses the app's window (cycling if one is already focused),
    // or launches the app when nothing is open. Right-click opens the menu; pinned icons
    // drag to reorder. A Component, not an inline `component`, so delegates can still see
    // ids like `dock` and `slide`.
    Component {
        id: dockItemDelegate

        Item {
            id: launcher
            required property string modelData
            required property int index
            // Searching `applications` (not `byId`) keeps this binding live until the async scan lands.
            readonly property var entry: DesktopEntries.applications.values.find(candidate => candidate.id === modelData) ?? null
            readonly property var windowIds: dock.windowIdsByEntryId[modelData] ?? []
            readonly property bool focused: windowIds.includes(Niri.focusedId)
            readonly property bool pinned: dock.launchers.includes(modelData)
            readonly property bool dragged: pinned && dock.dragFromIndex === index
            width: 40
            height: 40
            z: dragged ? 1 : 0
            // Pinned apps need a desktop entry to launch; unpinned ones only exist while open.
            visible: entry !== null || windowIds.length > 0

            transform: Translate {
                x: {
                    if (!launcher.pinned || dock.dragFromIndex === -1) return 0;
                    if (launcher.dragged) return dock.dragOffsetX;
                    if (dock.dragFromIndex < launcher.index && launcher.index <= dock.dragToIndex) return -dock.iconStep;
                    if (dock.dragToIndex <= launcher.index && launcher.index < dock.dragFromIndex) return dock.iconStep;
                    return 0;
                }
                Behavior on x {
                    enabled: !launcher.dragged
                    NumberAnimation { duration: 120; easing.type: Easing.OutCubic }
                }
            }

            // A rebuilt Repeater can destroy the icon mid-drag; don't leave the drag stuck.
            Component.onDestruction: if (dragged) {
                dock.dragFromIndex = -1;
                dock.dragOffsetX = 0;
            }

            function activate() {
                if (windowIds.length === 0) {
                    entry?.execute();
                    return;
                }
                const nextIndex = (windowIds.indexOf(Niri.focusedId) + 1) % windowIds.length;
                Quickshell.execDetached(["niri", "msg", "action", "focus-window", "--id", String(windowIds[nextIndex])]);
            }

            IconImage {
                anchors.fill: parent
                source: Quickshell.iconPath(launcher.entry?.icon ?? launcher.modelData, "application-x-executable")
                opacity: mouse.containsMouse && !launcher.dragged ? 0.7 : 1
            }

            // Running dot; wider for the app that owns the focused window.
            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.top: parent.bottom
                anchors.topMargin: 1
                width: launcher.focused ? 12 : 4
                height: 4
                radius: 2
                color: launcher.focused ? Theme.accent : Theme.fg
                visible: launcher.windowIds.length > 0
                Behavior on width { NumberAnimation { duration: 120 } }
            }

            MouseArea {
                id: mouse
                // Row-space x of the press; the icon's own coordinates move while it's dragged.
                property real pressRowX: 0
                anchors.fill: parent
                hoverEnabled: true
                acceptedButtons: Qt.LeftButton | Qt.RightButton
                cursorShape: launcher.dragged ? Qt.ClosedHandCursor : Qt.PointingHandCursor
                onPressed: event => {
                    // Menus open on press: niri only honors a popup's grab while the button
                    // that asked for it is still held, otherwise it dismisses the popup at once.
                    if (event.button === Qt.RightButton) dock.openMenu(launcher);
                    else pressRowX = mapToItem(icons, event.x, 0).x;
                }
                onPositionChanged: event => {
                    if (!(pressedButtons & Qt.LeftButton) || !launcher.pinned) return;
                    const offset = mapToItem(icons, event.x, 0).x - pressRowX;
                    // A few pixels of slop so a shaky click doesn't start a drag.
                    if (dock.dragFromIndex === -1 && Math.abs(offset) < 6) return;
                    dock.dragFromIndex = launcher.index;
                    dock.dragOffsetX = offset;
                }
                onReleased: event => {
                    if (dock.dragFromIndex !== -1) {
                        dock.finishDrag();
                    } else if (containsMouse && event.button === Qt.LeftButton) {
                        launcher.activate();
                    }
                }
                onCanceled: {
                    dock.dragFromIndex = -1;
                    dock.dragOffsetX = 0;
                }
            }

            Tooltip {
                anchorItem: launcher
                anchor.edges: Edges.Top
                anchor.gravity: Edges.Top
                anchor.margins.top: 0
                anchor.margins.bottom: 10
                text: launcher.entry?.name ?? launcher.modelData
                shown: mouse.containsMouse && !slide.running && dock.dragFromIndex === -1 && !menu.visible
            }
        }
    }

    BarPopup {
        id: menu
        readonly property var target: dock.menuTarget
        anchorItem: target ?? pill
        anchor.edges: Edges.Top
        anchor.gravity: Edges.Top
        anchor.margins.top: 0
        anchor.margins.bottom: 10
        contentWidth: 220
        spacing: 2
        onVisibleChanged: if (!visible) dock.menuTarget = null

        // The app's own desktop actions ("New Incognito Window" and friends).
        Repeater {
            model: menu.target?.entry?.actions ?? []

            MenuRow {
                required property var modelData
                text: modelData.name
                onClicked: {
                    modelData.execute();
                    menu.visible = false;
                }
            }
        }

        MenuRow {
            visible: menu.target?.entry != null
            text: "New window"
            onClicked: {
                menu.target.entry.execute();
                menu.visible = false;
            }
        }

        MenuRow {
            // Pinning needs a desktop entry, or the icon couldn't launch anything once closed.
            visible: menu.target !== null && (menu.target.entry !== null || menu.target.pinned)
            text: menu.target?.pinned ? "Unpin from dock" : "Pin to dock"
            onClicked: {
                dock.togglePin(menu.target.modelData);
                menu.visible = false;
            }
        }

        MenuRow {
            readonly property int windowCount: menu.target?.windowIds.length ?? 0
            visible: windowCount > 0
            text: windowCount === 1 ? "Close window" : "Close " + windowCount + " windows"
            textColor: Theme.red
            onClicked: {
                for (const windowId of menu.target.windowIds) {
                    Quickshell.execDetached(["niri", "msg", "action", "close-window", "--id", String(windowId)]);
                }
                menu.visible = false;
            }
        }
    }
}
