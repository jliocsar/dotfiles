import QtQuick

// A one-line text field.
Rectangle {
    id: root

    property alias text: input.text
    signal edited(string value)

    function focusAndSelect(): void {
        input.forceActiveFocus();
        input.selectAll();
    }

    width: 320
    height: 28
    radius: 8
    color: HokumStyle.field
    border.width: 1
    border.color: input.activeFocus ? HokumStyle.fieldFocus : HokumStyle.hairline

    TextInput {
        id: input
        anchors.fill: parent
        anchors.leftMargin: 8
        anchors.rightMargin: 8
        verticalAlignment: TextInput.AlignVCenter
        color: HokumStyle.text
        selectionColor: HokumStyle.accent
        selectedTextColor: "#ffffff"
        font.family: HokumStyle.font
        font.pixelSize: HokumStyle.ui
        clip: true
        onTextEdited: root.edited(text)
    }
}
