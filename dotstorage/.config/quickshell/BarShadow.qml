import QtQuick
import QtQuick.Effects

// Soft drop shadow for bar content (indicators, tray), used as `layer.effect`.
MultiEffect {
    shadowEnabled: true
    shadowColor: Theme.barShadow
    shadowBlur: 0.6
    shadowVerticalOffset: 1
    shadowHorizontalOffset: 0
}
