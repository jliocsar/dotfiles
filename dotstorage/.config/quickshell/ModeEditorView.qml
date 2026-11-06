import QtQuick
import QtQuick.Controls

// The mode editor, laid out like Hokum's settings window. Saves as you type.
Rectangle {
    id: root

    color: HokumStyle.window
    property int selected: 0
    property bool confirmingDelete: false
    readonly property var mode: ModeStore.modes[selected] ?? null

    function select(index: int): void {
        selected = Math.max(0, Math.min(index, ModeStore.modes.length - 1));
        confirmingDelete = false;
        loadFields();
    }

    function loadFields(): void {
        nameField.text = mode?.name ?? "";
        descriptionField.text = mode?.description ?? "";
        promptField.text = mode?.prompt ?? "";
    }

    function patch(change): void {
        if (!mode) return;
        const next = [...ModeStore.modes];
        next[selected] = Object.assign({}, mode, change);
        ModeStore.update(next);
    }

    function rename(name: string): void {
        patch({ name: name, id: ModeStore.slug(name, selected) });
    }

    function add(): void {
        const fresh = { id: ModeStore.slug("New mode", -1), name: "New mode", description: "", model: "haiku", prompt: "" };
        ModeStore.update([...ModeStore.modes, fresh]);
        select(ModeStore.modes.length - 1);
        nameField.focusAndSelect();
    }

    function remove(): void {
        ModeStore.update(ModeStore.modes.filter((_, i) => i !== selected));
        select(selected);
    }

    Component.onCompleted: {
        ModeStore.reload();
        loadFields();
    }

    Connections {
        target: ModeStore
        function onChangedOnDisk() { root.select(root.selected); }
    }

    // Sidebar
    Rectangle {
        id: sidebar
        width: 200
        height: parent.height
        color: HokumStyle.sidebar

        Rectangle {
            anchors.right: parent.right
            width: 1
            height: parent.height
            color: HokumStyle.hairline
        }

        HokumText {
            id: sidebarTitle
            x: 20
            y: 18
            text: "Modes"
            font.pixelSize: HokumStyle.heading
            font.weight: Font.DemiBold
        }

        ListView {
            id: list
            anchors.top: sidebarTitle.bottom
            anchors.topMargin: 16
            anchors.bottom: addRow.top
            anchors.bottomMargin: 8
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.leftMargin: 12
            anchors.rightMargin: 12
            clip: true
            spacing: 0
            boundsBehavior: Flickable.StopAtBounds
            model: ModeStore.modes

            delegate: Rectangle {
                id: row
                required property var modelData
                required property int index
                readonly property bool active: index === root.selected

                width: list.width
                height: 28
                radius: 8
                color: active ? HokumStyle.selected : rowMouse.containsMouse ? HokumStyle.hover : "transparent"

                HokumText {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.leftMargin: 10
                    anchors.rightMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                    text: row.modelData.name || "Untitled"
                    color: row.active ? HokumStyle.text : HokumStyle.muted
                    elide: Text.ElideRight
                }

                MouseArea {
                    id: rowMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.select(row.index)
                }
            }
        }

        // New mode, a plain sidebar row.
        Rectangle {
            id: addRow
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            anchors.margins: 12
            height: 28
            radius: 8
            color: addMouse.containsMouse ? HokumStyle.hover : "transparent"

            HokumText {
                anchors.left: parent.left
                anchors.leftMargin: 10
                anchors.verticalCenter: parent.verticalCenter
                text: "+  New mode"
                color: HokumStyle.muted
            }

            MouseArea {
                id: addMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.add()
            }
        }
    }

    // Main pane
    Item {
        anchors.left: sidebar.right
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.leftMargin: 24
        anchors.rightMargin: 24

        HokumText {
            id: heading
            y: 18
            anchors.left: parent.left
            anchors.right: deleteAction.left
            anchors.rightMargin: 12
            text: root.mode?.name || "Untitled"
            font.pixelSize: HokumStyle.heading
            font.weight: Font.DemiBold
            elide: Text.ElideRight
        }

        // A plain text action, like Hokum's Send test.
        HokumText {
            id: deleteAction
            anchors.right: parent.right
            anchors.verticalCenter: heading.verticalCenter
            visible: root.mode !== null
            text: root.confirmingDelete ? "Really delete?" : "Delete"
            color: root.confirmingDelete ? HokumStyle.danger : deleteMouse.containsMouse ? HokumStyle.text : HokumStyle.muted
            font.weight: Font.Medium

            MouseArea {
                id: deleteMouse
                anchors.fill: parent
                anchors.margins: -6
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    if (root.confirmingDelete) root.remove();
                    else root.confirmingDelete = true;
                }
            }
        }

        // Details
        Rectangle {
            id: details
            anchors.top: heading.bottom
            anchors.topMargin: 16
            width: parent.width
            height: rows.implicitHeight + 8
            radius: 12
            color: HokumStyle.section
            border.width: 1
            border.color: HokumStyle.hairline

            Column {
                id: rows
                anchors.fill: parent
                anchors.margins: 4

                ModeEditorRow {
                    title: "Name"
                    hint: "Shown in the picker"
                    ModeEditorField {
                        id: nameField
                        onEdited: value => root.rename(value)
                    }
                }

                Rectangle { x: 12; width: parent.width - 24; height: 1; color: HokumStyle.hairline }

                ModeEditorRow {
                    title: "Description"
                    hint: "One line under the name"
                    ModeEditorField {
                        id: descriptionField
                        onEdited: value => root.patch({ description: value })
                    }
                }

                Rectangle { x: 12; width: parent.width - 24; height: 1; color: HokumStyle.hairline }

                ModeEditorRow {
                    title: "Model"
                    hint: "Which Claude does the rewrite"
                    ModeEditorSegmented {
                        options: ["haiku", "sonnet", "opus"]
                        current: root.mode?.model ?? "haiku"
                        onSelected: value => root.patch({ model: value })
                    }
                }
            }
        }

        HokumText {
            id: promptLabel
            anchors.top: details.bottom
            anchors.topMargin: 18
            x: 12
            text: "Prompt"
            color: HokumStyle.muted
            font.weight: Font.Medium
        }

        // Prompt
        Rectangle {
            anchors.top: promptLabel.bottom
            anchors.topMargin: 8
            anchors.bottom: status.top
            anchors.bottomMargin: 10
            width: parent.width
            radius: 12
            color: HokumStyle.section
            border.width: 1
            border.color: promptField.activeFocus ? HokumStyle.fieldFocus : HokumStyle.hairline

            ScrollView {
                anchors.fill: parent
                anchors.margins: 6

                TextArea {
                    id: promptField
                    wrapMode: TextEdit.Wrap
                    color: HokumStyle.text
                    selectionColor: HokumStyle.accent
                    selectedTextColor: "#ffffff"
                    font.family: HokumStyle.font
                    font.pixelSize: HokumStyle.ui
                    background: null
                    onTextChanged: if (activeFocus && text !== root.mode?.prompt) root.patch({ prompt: text })
                }
            }
        }

        HokumText {
            id: status
            anchors.bottom: parent.bottom
            anchors.bottomMargin: 14
            x: 12
            text: ModeStore.error || (ModeStore.valid ? "Saved as you type" : "Needs a name and a prompt to save")
            color: ModeStore.error || !ModeStore.valid ? HokumStyle.danger : HokumStyle.dim
            font.pixelSize: HokumStyle.small
        }
    }
}
