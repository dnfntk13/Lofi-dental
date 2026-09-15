Option Explicit
Dim shell, files, launcher, command, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
launcher = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), "start-dentweb-agent.ps1")
command = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & launcher & Chr(34)
' Launch without allocating a visible console; preserve the launcher's exit code.
result = shell.Run(command, 0, True)
WScript.Quit result
