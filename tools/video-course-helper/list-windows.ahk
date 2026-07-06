#Requires AutoHotkey v2.0
#SingleInstance Force

; Lists visible windows so you can copy windowTitle/appLaunch values into
; course-queue.json for desktop app chapters.

windows := []

mainGui := Gui("+AlwaysOnTop", "Window Finder")
mainGui.SetFont("s9", "Segoe UI")
mainGui.Add("Text", "w860", "Open the course app first, then select its window below.")
windowList := mainGui.Add("ListView", "w860 r16 Grid", ["Title", "Process", "Path"])

refreshButton := mainGui.Add("Button", "xm w100", "Refresh")
copyButton := mainGui.Add("Button", "x+8 w170", "Copy selected config")
closeButton := mainGui.Add("Button", "x+8 w90", "Close")

refreshButton.OnEvent("Click", RefreshWindows)
copyButton.OnEvent("Click", CopySelectedConfig)
closeButton.OnEvent("Click", ExitHelper)
mainGui.OnEvent("Close", ExitHelper)

RefreshWindows()
mainGui.Show()

RefreshWindows(args*) {
  global windows, windowList
  windows := []
  windowList.Delete()

  for hwnd in WinGetList() {
    title := WinGetTitle("ahk_id " hwnd)
    if (Trim(title) = "") {
      continue
    }

    try processName := WinGetProcessName("ahk_id " hwnd)
    catch {
      processName := ""
    }

    try processPath := WinGetProcessPath("ahk_id " hwnd)
    catch {
      processPath := ""
    }

    windows.Push(Map(
      "title", title,
      "processName", processName,
      "processPath", processPath
    ))
    windowList.Add("", title, processName, processPath)
  }
}

CopySelectedConfig(args*) {
  global windows, windowList
  row := windowList.GetNext()
  if (!row) {
    MsgBox("Select a window first.", "Window Finder", "Icon!")
    return
  }

  item := windows[row]
  escapedTitle := JsonEscape(item["title"])
  escapedPath := JsonEscape(item["processPath"])
  config := "{`n"
    . "  `"id`": `"app-xuexitong-001`",`n"
    . "  `"title`": `"学习通课程第一节`",`n"
    . "  `"type`": `"app`",`n"
    . "  `"appLaunch`": `"" escapedPath "`",`n"
    . "  `"windowTitle`": `"" escapedTitle "`",`n"
    . "  `"hotkeys`": {`n"
    . "    `"playPause`": `"{Space}`",`n"
    . "    `"next`": `"`"`n"
    . "  },`n"
    . "  `"durationSeconds`": 1800`n"
    . "}"

  A_Clipboard := config
  MsgBox("Copied an app chapter config block to clipboard.", "Window Finder")
}

JsonEscape(value) {
  value := StrReplace(value, "\", "\\")
  value := StrReplace(value, '"', '\"')
  value := StrReplace(value, "`r", "")
  value := StrReplace(value, "`n", " ")
  return value
}

ExitHelper(args*) {
  ExitApp()
}
