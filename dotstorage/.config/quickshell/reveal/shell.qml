import Quickshell

// The circular reveal `theme` plays on a switch, in a shell of its own so a
// crash here never takes the bar down. ~/.local/bin/theme starts one per
// switch (qs -p ~/.config/quickshell/reveal); it quits when the reveal ends.
ShellRoot {
    ThemeReveal {}
}
