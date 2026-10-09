import QtQuick

// A single nerd-font glyph.
Text {
    color: Theme.fg
    font.family: Theme.iconFont
    font.pixelSize: Theme.iconSize
    verticalAlignment: Text.AlignVCenter
    // Hinted glyphs; the default distance-field text is soft at bar sizes.
    renderType: Text.NativeRendering
}
