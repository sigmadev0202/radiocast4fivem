local repoBranch = "updater"
local repoUser = "Radiocastdotnet"
local repoName = "fivem-integration"
local checkInterval = 1 * 60 * 1000 -- ms

local gitToken = nil

local rawUrl = "https://raw.githubusercontent.com/" .. repoUser .. "/" .. repoName .. "/" .. repoBranch .. "/"

local filesToUpdate = {
    "client/main.lua",
    "server/main.lua",
    "html/index.html",
    "html/script.js",
    "html/style.css",
    "html/radiocastlogo.webp"
}

-- Track whether this is the very first check since resource start
local isFirstCheck = true

-- Guard: prevent overlapping update attempts
local isUpdating = false

local function GetRawHeaders()
    local headers = {
        ["Cache-Control"] = "no-cache"
    }
    if gitToken and gitToken ~= "" then
        headers["Authorization"] = "token " .. gitToken
    end
    return headers
end

-- Broadcast a NUI message to ALL connected clients
local function BroadcastNUI(payload)
    TriggerClientEvent("Radiocast:NUIMessage", -1, payload)
end

local function DoRestart()
    -- DO NOT use ExecuteCommand("ensure") here!
    -- "ensure" does stop+start atomically from WITHIN our Lua VM.
    -- When "stop" destroys this VM, the "start" phase triggers a SIGSEGV
    -- because the calling context (our Lua state) no longer exists.
    --
    -- Instead we write a tiny .cfg file with separate stop/start commands
    -- and exec it.  "exec" queues ALL commands at the SERVER command-processor
    -- level, so after "stop" kills our VM the server still processes the
    -- queued "start" command and boots the resource with the new files.

    CreateThread(function()
        local resName = GetCurrentResourceName()

        -- Let OS flush file writes from SaveResourceFile
        Wait(3000)

        -- Build the restart cfg
        local cfgContent = "stop " .. resName .. "\nstart " .. resName .. "\n"
        SaveResourceFile(resName, "_restart.cfg", cfgContent, -1)

        print("^2[Radiocast] Restarting via _restart.cfg (stop + start)...^7")
        ExecuteCommand("exec @" .. resName .. "/_restart.cfg")
        -- Our VM will be destroyed by the "stop" above.
        -- The server command processor continues and runs "start" next.
    end)
end

local function UpdateFiles(newVersion)
    if isUpdating then
        print("^3[Radiocast] Update already in progress, skipping.^7")
        return
    end
    isUpdating = true

    print("^3[Radiocast] New version (" .. newVersion .. ") found on GitHub! Downloading updates...^7")

    local filesDownloaded = 0
    local filesFailed = 0
    local totalFiles = #filesToUpdate

    for i = 1, totalFiles do
        local file = filesToUpdate[i]
        PerformHttpRequest(rawUrl .. file, function(err, text, headers)
            if err == 200 and text then
                SaveResourceFile(GetCurrentResourceName(), file, text, -1)
                filesDownloaded = filesDownloaded + 1
                print("^2[Radiocast] Downloaded: " .. file .. "^7")
            else
                filesFailed = filesFailed + 1
                print("^1[Radiocast] Error downloading " .. file .. " (HTTP " .. tostring(err) .. ")^7")
            end

            -- Check if all HTTP requests have completed (success or fail)
            if (filesDownloaded + filesFailed) == totalFiles then
                if filesFailed > 0 then
                    print("^1[Radiocast] " .. filesFailed .. " file(s) failed to download. Aborting update to prevent corruption.^7")
                    isUpdating = false
                    return
                end

                -- All files saved successfully; write new version
                SaveResourceFile(GetCurrentResourceName(), "version.txt", newVersion, -1)
                print("^2[Radiocast] Update complete (" .. newVersion .. "). All " .. totalFiles .. " files saved.^7")

                if ServerConfig and ServerConfig.AutoRestart then
                    -- ── Grace-period announcement ──────────────────────────
                    print("^2[Radiocast] Auto-Restart enabled. Notifying clients, restarting in 15 seconds...^7")

                    -- Tell all clients: update incoming, play the notification sound,
                    -- freeze the UI and show the update overlay
                    BroadcastNUI({
                        action = "update_restart_warning",
                        version = newVersion
                    })

                    -- Wait 15 seconds, then restart cleanly
                    SetTimeout(15000, function()
                        print("^2[Radiocast] Restarting resource now...^7")
                        DoRestart()
                        -- isUpdating stays true intentionally — resource is about to restart
                    end)
                else
                    print("^2======================================================================^7")
                    print("^2[Radiocast] UPDATE SUCCESSFUL!^7")
                    print("^2[Radiocast] New version (" .. newVersion .. ") has been downloaded.^7")
                    print("^2[Radiocast] Please type ^3ensure " .. GetCurrentResourceName() .. " ^2in the console,^7")
                    print("^2[Radiocast] or restart your server to apply the new update.^7")
                    print("^2======================================================================^7")
                    isUpdating = false
                end
            end
        end, "GET", "", GetRawHeaders())
    end
end

CreateThread(function()
    while true do
        -- Only log "checking" on the very first run at boot
        if isFirstCheck then
            print("^4[Radiocast Updater] Checking for updates...^7")
        end

        -- Skip version check while an update is in progress
        if not isUpdating then
            PerformHttpRequest(rawUrl .. "version.txt", function(err, text, headers)
                if err == 200 and text then
                    local remoteVersion = text:gsub("%s+", "")
                    local localVersion = LoadResourceFile(GetCurrentResourceName(), "version.txt")

                    if localVersion then
                        localVersion = localVersion:gsub("%s+", "")
                    else
                        localVersion = "0"
                    end

                    if remoteVersion ~= localVersion and remoteVersion ~= "" then
                        -- Always print when an update is found
                        print("^4[Radiocast Updater] Local Version: " .. localVersion .. " | Remote Version: " .. remoteVersion .. "^7")
                        UpdateFiles(remoteVersion)
                    else
                        -- Only print "up to date" on the first check so the console isn't spammed
                        if isFirstCheck then
                            print("^4[Radiocast Updater] Up to date (v" .. localVersion .. ").^7")
                        end
                    end
                else
                    -- Always print failures so operators know something is wrong
                    print("^1[Radiocast Updater] Failed to fetch version.txt. HTTP " .. tostring(err) .. "^7")
                end

                isFirstCheck = false
            end, "GET", "", GetRawHeaders())
        end

        Wait(checkInterval)
    end
end)
