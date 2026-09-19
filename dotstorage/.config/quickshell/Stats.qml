pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// CPU / memory / package temperature / caps lock LED, polled from /proc and /sys.
// sysfs can't be inotify-watched, so a Timer reloads the FileViews.
Singleton {
    id: root

    property int cpuPercent: 0
    property int memoryPercent: 0
    property int temperatureC: 0
    property bool capsLock: false

    property real previousCpuTotal: 0
    property real previousCpuIdle: 0

    FileView {
        id: cpuFile
        path: "/proc/stat"
        onLoaded: {
            const fields = text().split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
            const idle = fields[3] + fields[4];
            const total = fields.reduce((sum, value) => sum + value, 0);
            const totalDelta = total - root.previousCpuTotal;
            if (totalDelta > 0) root.cpuPercent = Math.round(100 * (1 - (idle - root.previousCpuIdle) / totalDelta));
            root.previousCpuTotal = total;
            root.previousCpuIdle = idle;
        }
    }

    FileView {
        id: memoryFile
        path: "/proc/meminfo"
        onLoaded: {
            const info = {};
            for (const line of text().split("\n")) {
                const match = line.match(/^(\w+):\s+(\d+)/);
                if (match) info[match[1]] = Number(match[2]);
            }
            if (info.MemTotal > 0) root.memoryPercent = Math.round(100 * (info.MemTotal - info.MemAvailable) / info.MemTotal);
        }
    }

    FileView {
        id: temperatureFile
        // thermal_zone8 = x86_pkg_temp on this laptop.
        path: "/sys/class/thermal/thermal_zone8/temp"
        onLoaded: root.temperatureC = Math.round(Number(text()) / 1000)
    }

    // Input numbers change between boots, so resolve the LED dir once.
    property string ledPrefix: ""

    Process {
        running: true
        command: ["sh", "-c", "ls -d /sys/class/leds/input*::capslock | head -1 | sed 's/::capslock$//'"]
        stdout: StdioCollector {
            onStreamFinished: root.ledPrefix = text.trim()
        }
    }

    FileView {
        id: capsFile
        path: root.ledPrefix ? root.ledPrefix + "::capslock/brightness" : ""
        onLoaded: root.capsLock = text().trim() === "1"
    }

    Timer {
        interval: 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: capsFile.reload()
    }

    Timer {
        interval: 3000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            cpuFile.reload();
            memoryFile.reload();
            temperatureFile.reload();
        }
    }
}
