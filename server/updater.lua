local repoBranch = "updater"
local repoUser = "yourcpuisoverheating"
local repoName = "radiocast4fivem"
local checkInterval = 1 * 60 * 1000

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

local function GetRawHeaders()
    local headers = {
        ["Cache-Control"] = "no-cache"
    }
    if gitToken and gitToken ~= "" then
        headers["Authorization"] = "token " .. gitToken
    end
    return headers
end

local function UpdateFiles(newVersion)
    print("^3[Radiocast] New version ("..newVersion..") found on GitHub! Downloading updates...^7")
    
    local filesDownloaded = 0
    local totalFiles = #filesToUpdate
    
    for i=1, totalFiles do
        local file = filesToUpdate[i]
        PerformHttpRequest(rawUrl .. file, function(err, text, headers)
            if err == 200 and text then
                SaveResourceFile(GetCurrentResourceName(), file, text, -1)
                filesDownloaded = filesDownloaded + 1
                print("^2[Radiocast] Downloaded: " .. file .. "^7")
                
                if filesDownloaded == totalFiles then
                    print("^2[Radiocast] Update complete. Hot-reloading resource...^7")
                    SaveResourceFile(GetCurrentResourceName(), "version.txt", newVersion, -1)
                    
                    if ServerConfig.AutoRestart then
                        print("^2[Radiocast] Update downloaded! Auto-Restart enabled, reloading resource...^7")
                        SetTimeout(2000, function()
                            os.execute('refresh')
                            ExecuteCommand("ensure " .. GetCurrentResourceName())
                        end)
                    else
                        print("^2======================================================================^7")
                        print("^2[Radiocast] UPDATE SUCCESSFUL!^7")
                        print("^2[Radiocast] New version ("..newVersion..") has been downloaded.^7")
                        print("^2[Radiocast] Please type ^3ensure " .. GetCurrentResourceName() .. " ^2in the console,^7")
                        print("^2[Radiocast] or restart your server to apply the new update.^7")
                        print("^2======================================================================^7")
                    end
                end
            else
                print("^1[Radiocast] Error downloading " .. file .. " (HTTP " .. tostring(err) .. ")^7")
            end
        end, "GET", "", GetRawHeaders())
    end
end

CreateThread(function()
    while true do
        print("^4[Radiocast Updater] Checking for updates at " .. rawUrl .. "version.txt^7")
        PerformHttpRequest(rawUrl .. "version.txt", function(err, text, headers)
            if err == 200 and text then
                local remoteVersion = text:gsub("%s+", "")
                local localVersion = LoadResourceFile(GetCurrentResourceName(), "version.txt")
                
                if localVersion then
                    localVersion = localVersion:gsub("%s+", "")
                else
                    localVersion = "0"
                end
                
                print("^4[Radiocast Updater] Local Version: " .. localVersion .. " | Remote Version: " .. remoteVersion .. "^7")
                
                if remoteVersion ~= localVersion and remoteVersion ~= "" then
                    UpdateFiles(remoteVersion)
                else
                    print("^4[Radiocast Updater] No updates found.^7")
                end
            else
                print("^1[Radiocast Updater] Failed to fetch version.txt. HTTP " .. tostring(err) .. "^7")
            end
        end, "GET", "", GetRawHeaders())
        
        Wait(checkInterval)
    end
end)
