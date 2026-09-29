pragma Singleton
import QtQuick
import Quickshell

// The Jagex Launcher has to stay open while RuneLite runs: RuneLite inherits its
// LD_LIBRARY_PATH and maps libs from the launcher's AppImage mount, so closing the
// launcher eventually crashes the game with SIGBUS. Instead of closing it, the bar
// button parks it out of the way, and RuneLite starting up parks it automatically.
Singleton {
    id: root

    readonly property int launcherId: {
        const entry = Object.entries(Niri.windows).find(([, window]) => window.appId === "jagex-launcher");
        return entry ? Number(entry[0]) : -1;
    }

    // Parks the launcher if it's on the focused workspace, otherwise brings it here.
    function toggleLauncher() {
        const launcher = Niri.windows[launcherId];
        if (launcher === undefined) return;
        if (Niri.workspaces[launcher.workspaceId]?.focused) Niri.stashWindow(launcherId);
        else Niri.summonWindow(launcherId);
    }

    Connections {
        target: Niri
        function onWindowOpened(id, window) {
            if (window.appId.startsWith("net-runelite") && root.launcherId !== -1) Niri.stashWindow(root.launcherId);
        }
    }
}
