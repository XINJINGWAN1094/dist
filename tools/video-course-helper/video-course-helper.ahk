#Requires AutoHotkey v2.0
#SingleInstance Force

; Video Course Helper desktop runner.
; It handles only "app" chapters from course-queue.json and uses foreground
; window activation, hotkeys, optional coordinates, and human confirmation.

queuePath := A_ScriptDir "\course-queue.json"
statePath := A_ScriptDir "\course-queue.state.ini"
chapters := []
currentIndex := 1
running := false

mainGui := Gui("+AlwaysOnTop", "Video Course Helper")
mainGui.SetFont("s9", "Segoe UI")
statusText := mainGui.Add("Text", "w720 r3", "Load course-queue.json to begin.")
chapterList := mainGui.Add("ListView", "w720 r12 Grid", ["#", "ID", "Title", "Window", "Duration"])

buttonRow := mainGui.Add("Text", "w1 h1")
loadButton := mainGui.Add("Button", "xm w110", "Load queue")
startButton := mainGui.Add("Button", "x+8 w90", "Start")
pauseButton := mainGui.Add("Button", "x+8 w90", "Pause")
nextButton := mainGui.Add("Button", "x+8 w130", "Mark done + next")
openButton := mainGui.Add("Button", "x+8 w120", "Open folder")

loadButton.OnEvent("Click", LoadQueue)
startButton.OnEvent("Click", StartQueue)
pauseButton.OnEvent("Click", PauseQueue)
nextButton.OnEvent("Click", MarkDoneAndNext)
openButton.OnEvent("Click", OpenScriptFolder)

mainGui.OnEvent("Close", ExitHelper)
mainGui.Show()

LoadQueue()

LoadQueue(args*) {
  global queuePath, statePath, chapters, currentIndex, chapterList, statusText

  if !FileExist(queuePath) {
    statusText.Value := "Missing " queuePath ". Copy course-queue.example.json to course-queue.json and edit it first."
    return
  }

  output := GetAppChapterLines(queuePath)
  if (Trim(output) = "") {
    chapters := []
    chapterList.Delete()
    statusText.Value := "No app chapters found in course-queue.json. Web chapters are handled by the Tampermonkey script."
    return
  }

  chapters := []
  for line in StrSplit(Trim(output, "`r`n"), "`n") {
    line := Trim(line, "`r")
    if (line = "") {
      continue
    }

    fields := StrSplit(line, "`t")
    while fields.Length < 10 {
      fields.Push("")
    }

    chapters.Push(Map(
      "id", fields[1],
      "title", fields[2],
      "appLaunch", fields[3],
      "windowTitle", fields[4],
      "playHotkey", fields[5],
      "nextHotkey", fields[6],
      "durationSeconds", fields[7],
      "clickX", fields[8],
      "clickY", fields[9],
      "url", fields[10]
    ))
  }

  savedId := ""
  try savedId := IniRead(statePath, "state", "currentId", "")
  currentIndex := FindChapterIndex(savedId)
  RenderList()
  statusText.Value := "Loaded " chapters.Length " app chapter(s). Current index: " currentIndex "."
}

GetAppChapterLines(path) {
  ps := "$ErrorActionPreference = 'Stop'`n"
    . "$cfg = Get-Content -Raw -LiteralPath '" . EscapePowerShellSingle(path) . "' | ConvertFrom-Json`n"
    . "foreach ($chapter in @($cfg.chapters)) {`n"
    . "  if ($chapter.type -ne 'app') { continue }`n"
    . "  $hotkeys = $chapter.hotkeys`n"
    . "  $click = $chapter.click`n"
    . "  $fields = @(`n"
    . "    $chapter.id,`n"
    . "    $chapter.title,`n"
    . "    $chapter.appLaunch,`n"
    . "    $chapter.windowTitle,`n"
    . "    $hotkeys.playPause,`n"
    . "    $hotkeys.next,`n"
    . "    $chapter.durationSeconds,`n"
    . "    $click.x,`n"
    . "    $click.y,`n"
    . "    $chapter.url`n"
    . "  )`n"
    . "  (($fields | ForEach-Object {`n"
    . "    if ($null -eq $_) { '' } else { ([string]$_) -replace ""``t"", ' ' -replace ""``r?``n"", ' ' }`n"
    . "  }) -join ""``t"")`n"
    . "}`n"
  return RunPowerShell(ps)
}

RunPowerShell(script) {
  tempFile := A_Temp "\vch-read-queue-" A_TickCount ".ps1"
  FileAppend(script, tempFile, "UTF-8")
  shell := ComObject("WScript.Shell")
  quote := Chr(34)
  exec := shell.Exec("powershell.exe -NoProfile -ExecutionPolicy Bypass -File " quote tempFile quote)
  output := exec.StdOut.ReadAll()
  errorOutput := exec.StdErr.ReadAll()
  while exec.Status = 0 {
    Sleep(50)
  }
  try FileDelete(tempFile)
  if (exec.ExitCode != 0) {
    MsgBox("Failed to parse course-queue.json:`n`n" errorOutput, "Video Course Helper", "Iconx")
    return ""
  }
  return output
}

EscapePowerShellSingle(value) {
  return StrReplace(value, "'", "''")
}

FindChapterIndex(id) {
  global chapters
  if (id != "") {
    for index, chapter in chapters {
      if (chapter["id"] = id) {
        return index
      }
    }
  }
  return chapters.Length ? 1 : 0
}

RenderList() {
  global chapters, currentIndex, chapterList
  chapterList.Delete()
  for index, chapter in chapters {
    marker := (index = currentIndex) ? (">" index) : index
    duration := (chapter["durationSeconds"] != "") ? (chapter["durationSeconds"] "s") : "confirm"
    chapterList.Add("", marker, chapter["id"], chapter["title"], chapter["windowTitle"], duration)
  }
  if (currentIndex > 0) {
    chapterList.Modify(currentIndex, "Select Focus Vis")
  }
}

StartQueue(args*) {
  global running, chapters, currentIndex, statusText
  if (!chapters.Length) {
    LoadQueue()
  }
  if (!chapters.Length) {
    return
  }
  if (currentIndex < 1) {
    currentIndex := 1
  }
  running := true
  statusText.Value := "Running."
  RunCurrentChapter()
}

PauseQueue(args*) {
  global running, statusText
  running := false
  SetTimer(DurationReached, 0)
  statusText.Value := "Paused."
}

RunCurrentChapter() {
  global chapters, currentIndex, running, statePath, statusText

  if (!running || currentIndex < 1 || currentIndex > chapters.Length) {
    return
  }

  chapter := chapters[currentIndex]
  IniWrite(chapter["id"], statePath, "state", "currentId")
  RenderList()
  statusText.Value := "Opening: " chapter["title"]

  if !LaunchAndFocus(chapter) {
    running := false
    statusText.Value := "Paused: could not focus " chapter["title"]
    return
  }

  Sleep(400)
  if (chapter["clickX"] != "" && chapter["clickY"] != "") {
    MouseClick("Left", Number(chapter["clickX"]), Number(chapter["clickY"]))
    Sleep(250)
  }

  if (chapter["playHotkey"] != "") {
    Send(chapter["playHotkey"])
  }

  seconds := (chapter["durationSeconds"] = "") ? 0 : Number(chapter["durationSeconds"])
  if (seconds > 0) {
    SetTimer(DurationReached, -(seconds * 1000))
    statusText.Value := "Playing: " chapter["title"] ". A confirmation prompt will appear after " seconds " seconds."
  } else {
    running := false
    statusText.Value := "Playing: " chapter["title"] ". Click Mark done + next after you finish watching."
  }
}

LaunchAndFocus(chapter) {
  launch := chapter["appLaunch"]
  url := chapter["url"]
  title := chapter["windowTitle"]

  if (launch != "" || url != "") {
    try Run(launch != "" ? launch : url)
  }

  if (title = "") {
    return true
  }

  hwnd := WinWait(title,, 20)
  if (!hwnd) {
    MsgBox("Window not found:`n" title, "Video Course Helper", "Icon!")
    return false
  }

  WinActivate(title)
  if !WinWaitActive(title,, 10) {
    MsgBox("Window did not become active:`n" title, "Video Course Helper", "Icon!")
    return false
  }
  return true
}

DurationReached(args*) {
  global running, chapters, currentIndex, statusText
  if (!running || currentIndex < 1 || currentIndex > chapters.Length) {
    return
  }

  chapter := chapters[currentIndex]
  running := false
  result := MsgBox(
    "Timer reached for:`n" chapter["title"] "`n`nOnly continue if you actually finished watching this lesson.",
    "Confirm lesson completion",
    "YesNo Icon?"
  )

  if (result = "Yes") {
    MarkDoneAndNext()
  } else {
    statusText.Value := "Paused for manual review: " chapter["title"]
  }
}

MarkDoneAndNext(args*) {
  global chapters, currentIndex, running, statusText
  if (!chapters.Length || currentIndex < 1 || currentIndex > chapters.Length) {
    return
  }

  chapter := chapters[currentIndex]
  AppendCompleted(chapter["id"])

  if (chapter["nextHotkey"] != "") {
    Send(chapter["nextHotkey"])
    Sleep(500)
  }

  currentIndex += 1
  if (currentIndex > chapters.Length) {
    running := false
    statusText.Value := "All app chapters are complete."
    RenderList()
    MsgBox("All app chapters are complete.", "Video Course Helper")
    return
  }

  running := true
  RunCurrentChapter()
}

AppendCompleted(id) {
  global statePath
  completed := ""
  try completed := IniRead(statePath, "state", "completed", "")
  list := completed = "" ? id : completed "," id
  IniWrite(list, statePath, "state", "completed")
}

OpenScriptFolder(args*) {
  Run(A_ScriptDir)
}

ExitHelper(args*) {
  ExitApp()
}
